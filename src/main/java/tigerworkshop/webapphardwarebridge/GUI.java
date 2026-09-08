package tigerworkshop.webapphardwarebridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.log4j.Log4j2;
import tigerworkshop.webapphardwarebridge.dtos.Config;
import tigerworkshop.webapphardwarebridge.dtos.NotificationDTO;
import tigerworkshop.webapphardwarebridge.interfaces.WebSocketServerInterface;
import tigerworkshop.webapphardwarebridge.interfaces.WebSocketServiceInterface;
import tigerworkshop.webapphardwarebridge.services.ConfigService;

import javax.imageio.ImageIO;
import java.awt.*;
import java.io.File;
import java.net.URI;
import java.util.Locale;
import java.util.Objects;

@Log4j2
public class GUI implements WebSocketServiceInterface {
    private static final ConfigService configService = ConfigService.getInstance();

    // java.awt.TrayIcon's native Linux (X11/XEmbed) peer can't reliably report click
    // coordinates or menu size under GNOME - the popup menu it drives ends up tiny and/or
    // positioned nowhere near the icon, especially with fractional display scaling. On
    // Linux we use dorkbox SystemTray instead, which talks to the desktop's native
    // AppIndicator/GtkStatusIcon so the shell itself renders and positions the menu.
    private static final boolean IS_LINUX = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux");

    private final Server server = new Server();
    private Config config = configService.getConfig();

    Desktop desktop = Desktop.getDesktop();

    // Non-Linux (AWT native tray)
    TrayIcon trayIcon;
    SystemTray tray;

    // Linux (dorkbox native tray)
    private dorkbox.systemTray.SystemTray dorkboxTray;

    public static void main(String[] args) throws Exception {
        GUI gui = new GUI();
        gui.launch();
    }

    public void launch() throws Exception {
        server.start();

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

        if (IS_LINUX) {
            launchLinuxTray(openWebUI, openAppDirectory, openLogDirectory, restartAction, exitAction);
        } else {
            launchAwtTray(openWebUI, openAppDirectory, openLogDirectory, restartAction, exitAction);
        }

        notify(Constants.APP_NAME, " is running in background!", TrayIcon.MessageType.INFO);
    }

    private void launchLinuxTray(Runnable openWebUI, Runnable openAppDirectory, Runnable openLogDirectory, Runnable restartAction, Runnable exitAction) {
        dorkboxTray = dorkbox.systemTray.SystemTray.get();
        if (dorkboxTray == null) {
            log.warn("SystemTray is not supported");
            return;
        }

        dorkboxTray.setTooltip(Constants.APP_NAME);
        dorkboxTray.setImage(getClass().getClassLoader().getResource("icon.png"));

        dorkbox.systemTray.Menu menu = dorkboxTray.getMenu();
        menu.add(new dorkbox.systemTray.MenuItem("Web UI", e -> openWebUI.run()));
        menu.add(new dorkbox.systemTray.Separator());
        menu.add(new dorkbox.systemTray.MenuItem("App Directory", e -> openAppDirectory.run()));
        menu.add(new dorkbox.systemTray.MenuItem("Log Directory", e -> openLogDirectory.run()));
        menu.add(new dorkbox.systemTray.Separator());
        menu.add(new dorkbox.systemTray.MenuItem("Restart", e -> restartAction.run()));
        menu.add(new dorkbox.systemTray.MenuItem("Exit", e -> exitAction.run()));
    }

    private void launchAwtTray(Runnable openWebUI, Runnable openAppDirectory, Runnable openLogDirectory, Runnable restartAction, Runnable exitAction) throws Exception {
        if (!SystemTray.isSupported()) {
            log.warn("SystemTray is not supported");
            return;
        }

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

        tray = SystemTray.getSystemTray();

        // Set icon
        Dimension trayIconSize = tray.getTrayIconSize();
        final Image image = ImageIO.read(Objects.requireNonNull(getClass().getClassLoader().getResource("icon.png")));
        final Image scaledImage = image.getScaledInstance(trayIconSize.width, trayIconSize.height, Image.SCALE_SMOOTH);

        trayIcon = new TrayIcon(scaledImage, Constants.APP_NAME);
        trayIcon.setPopupMenu(popupMenu);

        tray.add(trayIcon);
    }

    public void notify(String title, String message, TrayIcon.MessageType messageType) {
        if (IS_LINUX) {
            try {
                if (dorkboxTray != null) {
                    new ProcessBuilder("notify-send", title, message).start();
                }
            } catch (Exception e) {
                log.error("Failed to display notification", e);
            }
            return;
        }

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
