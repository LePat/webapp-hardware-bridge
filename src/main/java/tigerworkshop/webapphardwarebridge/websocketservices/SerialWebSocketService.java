package tigerworkshop.webapphardwarebridge.websocketservices;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fazecast.jSerialComm.SerialPort;
import com.fazecast.jSerialComm.SerialPortInvalidPortException;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.codec.binary.Hex;
import tigerworkshop.webapphardwarebridge.dtos.Config;
import tigerworkshop.webapphardwarebridge.dtos.NotificationDTO;
import tigerworkshop.webapphardwarebridge.interfaces.WebSocketServerInterface;
import tigerworkshop.webapphardwarebridge.interfaces.WebSocketServiceInterface;
import tigerworkshop.webapphardwarebridge.utils.ThreadUtil;

import java.nio.charset.Charset;
import java.util.Objects;
import java.util.concurrent.LinkedTransferQueue;
import java.util.concurrent.TransferQueue;

@Log4j2
public class SerialWebSocketService implements WebSocketServiceInterface {
    private WebSocketServerInterface server;

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final Config.SerialMapping mapping;
    private volatile SerialPort serialPort;
    private TransferQueue<byte[]> transferQueue = new LinkedTransferQueue<>();

    private Thread readThread;
    private Thread writeThread;
    private Thread monitorThread;

    private Boolean isRunning = true;

    private static final String BINARY = "BINARY";

    public SerialWebSocketService(Config.SerialMapping newMapping) {
        log.info("Starting SerialWebSocketService on {}", newMapping.getName());

        this.mapping = newMapping;

        // Le port n'est pas résolu ici : getCommPort() lève une exception si le
        // périphérique est absent au démarrage, ce qui faisait définitivement échouer
        // le service (redémarrage du WHB obligatoire). La résolution + ouverture est
        // désormais (re)tentée par le monitorThread (voir openSerialPort()), donc un
        // périphérique éteint au démarrage puis allumé est pris en compte à chaud.
    }

    /**
     * (Re)tente de résoudre puis d'ouvrir le port série. Tolérant à l'absence du
     * périphérique : s'il n'existe pas encore, on réessaiera au cycle suivant du monitor.
     */
    private void openSerialPort() {
        try {
            SerialPort port = SerialPort.getCommPort(mapping.getName());

            if (mapping.getBaudRate() != null) port.setBaudRate(mapping.getBaudRate());
            if (mapping.getNumDataBits() != null) port.setNumDataBits(mapping.getNumDataBits());
            if (mapping.getNumStopBits() != null) port.setNumStopBits(mapping.getNumStopBits());
            if (mapping.getParity() != null) port.setParity(mapping.getParity());

            if (port.openPort(1000)) {
                serialPort = port;
                log.info("Serial {} is now open", mapping.getName());
            }
        } catch (SerialPortInvalidPortException e) {
            // Périphérique absent (éteint/débranché) : nouvelle tentative au prochain cycle.
            log.debug("Serial {} not present yet: {}", mapping.getName(), e.getMessage());
        }
    }

    @Override
    public void start() {
        isRunning = true;

        readThread = new Thread(() -> {
            log.debug("Serial Read Thread started for {}", mapping.getName());

            while (isRunning) {
                SerialPort port = serialPort;
                if (port != null && port.isOpen()) {
                    int bytesAvailable = port.bytesAvailable();
                    if (bytesAvailable == 0) {
                        // No data coming from COM portName
                        ThreadUtil.silentSleep(10);
                        continue;
                    } else if (bytesAvailable == -1) {
                        // Check if portName closed unexpected (e.g. Unplugged)
                        port.closePort();

                        try {
                            server.messageToService("/notification", objectMapper.writeValueAsString(new NotificationDTO("WARNING", "Serial Port", "Serial " + mapping.getName() + "(" + mapping.getType() + ") unplugged")));
                        } catch (JsonProcessingException e) {
                            log.error("Failed to send notification: {}", e.getMessage());
                        }

                        log.warn("Serial {} unplugged", mapping.getName());

                        continue;
                    }

                    int bytesToRead = mapping.getReadMultipleBytes() ? bytesAvailable : 1;

                    byte[] receivedData = new byte[bytesToRead];
                    port.readBytes(receivedData, bytesToRead);

                    if (server != null) {
                        if (Objects.equals(mapping.getReadCharset(), BINARY)) server.messageToServer(getChannel(), receivedData);
                        else server.messageToServer(getChannel(), new String(receivedData, Charset.forName(mapping.getReadCharset())));
                    }
                } else {
                    // Port absent/fermé : éviter une boucle à 100% CPU (aucune pause) qui
                    // affamerait le serveur HTTP/WS. Le monitorThread (ré)ouvre le port.
                    ThreadUtil.silentSleep(100);
                }
            }

            log.debug("Serial Read Thread stopped for {}", mapping.getName());
        });

        // Consumer
        writeThread = new Thread(() -> {
            log.debug("Serial Write Thread started for {}", mapping.getName());

            while (isRunning) {
                SerialPort port = serialPort;
                if (port != null && port.isOpen()) {
                	try {
						byte[] message = transferQueue.take();
	                    log.info("Bytes: {}", Hex.encodeHexString(message));
	                    port.writeBytes(message, message.length);
					} catch (InterruptedException e) {
						log.error("Error writing on serial " + mapping.getName());
					}
                } else {
                    // Port absent/fermé : éviter la boucle à 100% CPU. Le monitorThread (ré)ouvre.
                    ThreadUtil.silentSleep(100);
                }
            }

            log.debug("Serial Write Thread stopped for {}", mapping.getName());
        });

        monitorThread = new Thread(() -> {
            log.debug("Serial Monitor Thread started for {}", mapping.getName());

            while (isRunning) {
                SerialPort port = serialPort;
                if (port != null && port.isOpen()) {
                    ThreadUtil.silentSleep(1000);
                } else {
                    log.info("Trying to connect to serial @ {}", mapping.getName());
                    openSerialPort();
                    ThreadUtil.silentSleep(1000);
                }
            }

            log.debug("Serial Monitor Thread stopped for {}", mapping.getName());
        });

        readThread.start();
        writeThread.start();
        monitorThread.start();
    }

    @Override
    public void stop() {
        log.info("Stopping SerialWebSocketService");

        isRunning = false;

        readThread.interrupt();
        writeThread.interrupt();
        monitorThread.interrupt();

        SerialPort port = serialPort;
        if (port != null) port.closePort();

        log.info("Stopped SerialWebSocketService");
    }

    @Override
    public void messageToService(String message) {
        messageToService(message.getBytes());
    }

    @Override
    public void messageToService(byte[] message) {
    	// Producer
    	// Ne pas accumuler les écritures quand le port est fermé (périphérique éteint) :
    	// sinon la file se viderait d'un bloc à la reconnexion, déversant des trames
    	// périmées (ex. mises à jour d'afficheur obsolètes) au périphérique.
    	SerialPort port = serialPort;
    	if (port != null && port.isOpen()) {
    		transferQueue.add(message);
    	} else {
    		log.debug("Serial {} closed, dropping {} byte(s) write", mapping.getName(), message.length);
    	}
    }

    @Override
    public void onRegister(WebSocketServerInterface newServer) {
        this.server = newServer;
    }

    @Override
    public void onUnregister() {
        this.server = null;
    }

    @Override
    public String getChannel() {
        return "/serial/" + mapping.getType();
    }
}
