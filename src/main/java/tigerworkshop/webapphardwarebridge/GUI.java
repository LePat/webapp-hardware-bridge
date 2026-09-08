package tigerworkshop.webapphardwarebridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.log4j.Log4j2;
import tigerworkshop.webapphardwarebridge.dtos.Config;
import tigerworkshop.webapphardwarebridge.dtos.NotificationDTO;
import tigerworkshop.webapphardwarebridge.interfaces.WebSocketServerInterface;
import tigerworkshop.webapphardwarebridge.interfaces.WebSocketServiceInterface;
import tigerworkshop.webapphardwarebridge.services.ConfigService;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.imageio.ImageIO;
import javax.swing.JDialog;
import javax.swing.JMenuItem;
import javax.swing.JPopupMenu;
import javax.swing.SwingUtilities;
import javax.swing.UIManager;
import javax.swing.event.PopupMenuEvent;
import javax.swing.event.PopupMenuListener;
import javax.xml.parsers.DocumentBuilderFactory;
import java.awt.*;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.io.File;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

@Log4j2
public class GUI implements WebSocketServiceInterface {
    private static final ConfigService configService = ConfigService.getInstance();

    private final Server server = new Server();
    private Config config = configService.getConfig();

    Desktop desktop = Desktop.getDesktop();
    TrayIcon trayIcon;
    SystemTray tray;

    // Linux's native AWT PopupMenu peer (XTrayIconPeer) renders a tiny, badly positioned
    // menu on many desktop environments and can throw a harmless UnsupportedOperationException
    // on double-click. We bypass it there with a manually positioned Swing JPopupMenu instead.
    private static final boolean IS_LINUX = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux");
    private JDialog linuxPopupOwner;

    public static void main(String[] args) throws Exception {
        GUI gui = new GUI();
        gui.launch();
    }

    public void launch() throws Exception {
        server.start();

        // Create tray icon
        if (!SystemTray.isSupported()) {
            log.warn("SystemTray is not supported");
            return;
        }

        // Register service as notification listener
        if (config.getGui().getNotification().isEnabled()) {
            server.registerService(this);
        }

        Runnable openWebUI = () -> {
            try {
                if (desktop == null || !desktop.isSupported(Desktop.Action.BROWSE)) {
                    throw new Exception("Desktop browse is not supported");
                }

                desktop.browse(new URI(config.getServer().getUri()));
            } catch (Exception ex) {
                log.error("Failed to open Web UI", ex);
            }
        };

        Runnable openAppDirectory = () -> {
            try {
                if (desktop == null || !desktop.isSupported(Desktop.Action.OPEN)) {
                    throw new Exception("Desktop open is not supported");
                }

                desktop.open(new File("."));
            } catch (Exception ex) {
                log.error("Failed to open log folder", ex);
            }
        };

        Runnable openLogDirectory = () -> {
            try {
                if (desktop == null || !desktop.isSupported(Desktop.Action.OPEN)) {
                    throw new Exception("Desktop open is not supported");
                }

                desktop.open(new File("log"));
            } catch (Exception ex) {
                log.error("Failed to open log folder", ex);
            }
        };

        Runnable restartAction = this::restart;
        Runnable exitAction = () -> System.exit(0);

        tray = SystemTray.getSystemTray();

        // Set icon
        Dimension trayIconSize = tray.getTrayIconSize();
        final Image image = ImageIO.read(Objects.requireNonNull(getClass().getClassLoader().getResource("icon.png")));
        final Image scaledImage = image.getScaledInstance(trayIconSize.width, trayIconSize.height, Image.SCALE_SMOOTH);

        trayIcon = new TrayIcon(scaledImage, Constants.APP_NAME);

        if (IS_LINUX) {
            // Native AWT PopupMenu on Linux (XTrayIconPeer) is a long-standing JDK bug:
            // it renders tiny/mispositioned on many desktop environments and can log a
            // harmless UnsupportedOperationException on click. Use a Swing JPopupMenu instead.
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception ex) {
                log.warn("Failed to set system look and feel for tray menu", ex);
            }

            JPopupMenu popupMenu = new JPopupMenu();
            popupMenu.add(swingMenuItem("Web UI", openWebUI));
            popupMenu.addSeparator();
            popupMenu.add(swingMenuItem("App Directory", openAppDirectory));
            popupMenu.add(swingMenuItem("Log Directory", openLogDirectory));
            popupMenu.addSeparator();
            popupMenu.add(swingMenuItem("Restart", restartAction));
            popupMenu.add(swingMenuItem("Exit", exitAction));

            trayIcon.addMouseListener(new MouseAdapter() {
                @Override
                public void mouseReleased(MouseEvent e) {
                    Point physical = new Point();
                    double scale = resolveGnomeClickPosition(e.getX(), e.getY(), physical);
                    showLinuxPopup(popupMenu, physical.x, physical.y, scale);
                }
            });
        } else {
            MenuItem settingItem = new MenuItem("Web UI");
            settingItem.addActionListener(e -> openWebUI.run());

            MenuItem appDirectoryItem = new MenuItem("App Directory");
            appDirectoryItem.addActionListener(e -> openAppDirectory.run());

            MenuItem logDirectoryItem = new MenuItem("Log Directory");
            logDirectoryItem.addActionListener(e -> openLogDirectory.run());

            MenuItem restartItem = new MenuItem("Restart");
            restartItem.addActionListener(e -> restartAction.run());

            MenuItem exitItem = new MenuItem("Exit");
            exitItem.addActionListener(e -> exitAction.run());

            final PopupMenu popupMenu = new PopupMenu();
            popupMenu.add(settingItem);
            popupMenu.addSeparator();
            popupMenu.add(appDirectoryItem);
            popupMenu.add(logDirectoryItem);
            popupMenu.addSeparator();
            popupMenu.add(restartItem);
            popupMenu.add(exitItem);

            trayIcon.setPopupMenu(popupMenu);
        }

        tray.add(trayIcon);

        notify(Constants.APP_NAME, " is running in background!", TrayIcon.MessageType.INFO);
    }

    private record GnomeLogicalMonitor(double logicalX, double logicalY, double logicalWidth, double logicalHeight,
                                        double scale, int physicalWidth, int physicalHeight) {
    }

    private List<GnomeLogicalMonitor> gnomeMonitorLayout;

    /**
     * GNOME (Mutter) keeps each output's fractional scale factor in ~/.config/monitors.xml -
     * there is no gsettings key for it (org.gnome.desktop.interface scaling-factor only covers
     * the old integer-only HiDPI toggle). This is the same file the Settings app itself
     * reads/writes, so it reflects the real configured scale rather than a guessed constant.
     */
    private List<GnomeLogicalMonitor> loadGnomeMonitorLayout() {
        List<GnomeLogicalMonitor> result = new ArrayList<>();

        try {
            File file = new File(System.getProperty("user.home"), ".config/monitors.xml");
            if (!file.exists()) {
                return result;
            }

            Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file);
            NodeList logicalMonitors = doc.getElementsByTagName("logicalmonitor");

            for (int i = 0; i < logicalMonitors.getLength(); i++) {
                Element logicalMonitor = (Element) logicalMonitors.item(i);

                double x = parseDoubleTag(logicalMonitor, "x", 0);
                double y = parseDoubleTag(logicalMonitor, "y", 0);
                double scale = parseDoubleTag(logicalMonitor, "scale", 1.0);

                NodeList modes = logicalMonitor.getElementsByTagName("mode");
                if (modes.getLength() == 0) {
                    continue;
                }

                Element mode = (Element) modes.item(0);
                int width = (int) parseDoubleTag(mode, "width", 0);
                int height = (int) parseDoubleTag(mode, "height", 0);
                if (width <= 0 || height <= 0 || scale <= 0) {
                    continue;
                }

                result.add(new GnomeLogicalMonitor(x, y, width / scale, height / scale, scale, width, height));
            }
        } catch (Exception ex) {
            log.debug("Failed to read GNOME monitors.xml for tray menu scale detection", ex);
        }

        return result;
    }

    private double parseDoubleTag(Element parent, String tagName, double defaultValue) {
        NodeList nodes = parent.getElementsByTagName(tagName);
        if (nodes.getLength() == 0) {
            return defaultValue;
        }

        try {
            return Double.parseDouble(nodes.item(0).getTextContent().trim());
        } catch (Exception ex) {
            return defaultValue;
        }
    }

    /**
     * TrayIcon's MouseEvent coordinates on Linux come from GNOME Shell's Wayland-native
     * compositor and are expressed in GNOME's logical (post-scale) coordinate space, while
     * Java positions its own AWT/Swing windows in physical pixels (java.awt reports scale 1.0
     * even when GNOME is scaling a given output). Translate the event position into physical
     * pixels using the real per-monitor scale from GNOME's own config, falling back to the raw
     * coordinates unscaled when that config isn't available (non-GNOME desktops, etc.).
     */
    private double resolveGnomeClickPosition(int eventX, int eventY, Point outPhysical) {
        if (gnomeMonitorLayout == null) {
            gnomeMonitorLayout = loadGnomeMonitorLayout();
        }

        for (GnomeLogicalMonitor monitor : gnomeMonitorLayout) {
            boolean withinLogicalBounds = eventX >= monitor.logicalX() && eventX < monitor.logicalX() + monitor.logicalWidth()
                    && eventY >= monitor.logicalY() && eventY < monitor.logicalY() + monitor.logicalHeight();
            if (!withinLogicalBounds) {
                continue;
            }

            for (GraphicsDevice gd : GraphicsEnvironment.getLocalGraphicsEnvironment().getScreenDevices()) {
                Rectangle bounds = gd.getDefaultConfiguration().getBounds();
                if (bounds.width == monitor.physicalWidth() && bounds.height == monitor.physicalHeight()) {
                    outPhysical.x = bounds.x + (int) Math.round((eventX - monitor.logicalX()) * monitor.scale());
                    outPhysical.y = bounds.y + (int) Math.round((eventY - monitor.logicalY()) * monitor.scale());
                    return monitor.scale();
                }
            }
        }

        outPhysical.x = eventX;
        outPhysical.y = eventY;
        return 1.0;
    }

    private JMenuItem swingMenuItem(String label, Runnable action) {
        JMenuItem item = new JMenuItem(label);
        item.addActionListener(e -> action.run());
        return item;
    }

    /**
     * Shows a Swing JPopupMenu at the given physical screen coordinates, using a throwaway
     * invisible JDialog as the invoker since JPopupMenu requires a Component to anchor to.
     * The menu's font is scaled to match the monitor's real GNOME scale factor.
     */
    private void showLinuxPopup(JPopupMenu popupMenu, int screenX, int screenY, double scale) {
        SwingUtilities.invokeLater(() -> {
            Font baseFont = UIManager.getFont("MenuItem.font");
            if (baseFont != null) {
                Font scaledFont = baseFont.deriveFont((float) (baseFont.getSize2D() * scale));
                for (Component c : popupMenu.getComponents()) {
                    c.setFont(scaledFont);
                }
            }

            if (linuxPopupOwner == null) {
                linuxPopupOwner = new JDialog();
                linuxPopupOwner.setUndecorated(true);
                linuxPopupOwner.setAlwaysOnTop(true);
                linuxPopupOwner.setSize(1, 1);

                popupMenu.addPopupMenuListener(new PopupMenuListener() {
                    @Override
                    public void popupMenuWillBecomeVisible(PopupMenuEvent e) {
                    }

                    @Override
                    public void popupMenuWillBecomeInvisible(PopupMenuEvent e) {
                        linuxPopupOwner.setVisible(false);
                    }

                    @Override
                    public void popupMenuCanceled(PopupMenuEvent e) {
                        linuxPopupOwner.setVisible(false);
                    }
                });
            }

            linuxPopupOwner.setLocation(screenX, screenY);
            linuxPopupOwner.setVisible(true);
            popupMenu.show(linuxPopupOwner, 0, 0);
        });
    }

    public void notify(String title, String message, TrayIcon.MessageType messageType) {
        try {
            trayIcon.displayMessage(title, message, messageType);
        } catch (Exception e) {
            log.error("Failed to display notification", e);
        }
    }

    public void restart() {
        try {
            config = configService.getConfig();

            server.stop();
            server.start();

            notify("Restart", "Server restarted successfully", TrayIcon.MessageType.INFO);
        } catch (Exception e) {
            log.error("Failed to restart server", e);
        }
    }

    @Override
    public void start() {

    }

    @Override
    public void stop() {

    }

    @Override
    public void messageToService(String message) {
        try {
            log.debug("GUI Notification: {}", message);

            NotificationDTO notificationDTO = new ObjectMapper().readValue(message, NotificationDTO.class);
            notify(notificationDTO.getTitle(), notificationDTO.getMessage(), TrayIcon.MessageType.valueOf(notificationDTO.getType()));
        } catch (Exception e) {
            log.error("Failed to parse notification message", e);
        }
    }

    @Override
    public void messageToService(byte[] message) {
    }

    @Override
    public void onRegister(WebSocketServerInterface server) {

    }

    @Override
    public void onUnregister() {
    }

    @Override
    public String getChannel() {
        return "/notification";
    }
}
