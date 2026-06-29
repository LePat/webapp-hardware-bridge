package tigerworkshop.webapphardwarebridge.interfaces;


public interface WebSocketServerInterface {
    void messageToServer(String channel, String message);

    void messageToServer(String channel, byte[] message);

    void messageToService(String channel, String message);

    void messageToService(String channel, byte[] message);

    void registerService(WebSocketServiceInterface service);

    void unregisterService(WebSocketServiceInterface service);

    void disconnectChannel(String channel, int code, String reason);
}
