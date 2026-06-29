package tigerworkshop.webapphardwarebridge.utils;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.ConcurrentLinkedQueue;

import org.apache.commons.codec.binary.Base64;

import io.javalin.websocket.WsContext;

public class EscPOSPrinter {

	private final static String ESCPOS_TO_HTML = "../escpos-tools/esc2html.php";
	private final static String FILENAME = "../escpos-tools/escpos-printer";
	private final static String BINARY_EXTENSION = ".bin";
	private final static String HTML_EXTENSION = ".html";

	public static void writeReceiptToPrint(byte[] data, boolean base64Encoded) throws IOException {
		// Le chemin texte (onMessage) transporte rawContent en base64 ; le chemin binaire
		// (onBinaryMessage) transporte l'ESC/POS brut. Ne décoder que dans le premier cas :
		// décoder du binaire brut comme du base64 corromprait les données.
		byte[] raw = base64Encoded ? Base64.decodeBase64(data) : data;
		Files.write(Paths.get(FILENAME + BINARY_EXTENSION), raw, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.CREATE);
	}

	public static void convertReceiptToHTML() throws IOException, InterruptedException {
		String[] commandes = new String[] { "php", ESCPOS_TO_HTML, FILENAME + BINARY_EXTENSION };
		ProcessBuilder processBuilder = new ProcessBuilder(commandes);
		Process process = processBuilder.start();
		process.getErrorStream().transferTo(System.err);
		File receiptHTML = new File(FILENAME + HTML_EXTENSION);
		FileOutputStream fos = new FileOutputStream(receiptHTML);
		process.getInputStream().transferTo(fos);
		process.waitFor();
		fos.close();
	}
	
	public static void sendPrintedReceipt(ConcurrentLinkedQueue<WsContext> concurrentLinkedQueue, String channelPOSPrinter) {
		byte[] fileContent;
		try {
			fileContent = Files.readAllBytes(Paths.get(FILENAME + HTML_EXTENSION));
			if (fileContent != null) {
				String outputHTML = new String(fileContent, "UTF-8");
				if (outputHTML != null) {
					concurrentLinkedQueue.forEach(client -> client.send(outputHTML));
					return;
				}
			}
		} catch (IOException e) {
			System.err.println(e.getClass().getName() + ": " + e.getMessage());
		}
		concurrentLinkedQueue.forEach(client -> client.send("empty"));
	}

	public static void convertReceiptToHTMLAndSendResult(byte[] data, boolean base64Encoded, ConcurrentLinkedQueue<WsContext> socketsForChannel, String channelPOSPrinter) throws IOException, InterruptedException {
        // écrire les données reçues dans un fichier
        EscPOSPrinter.writeReceiptToPrint(data, base64Encoded);
        // appeler la commande de conversion en HTML
        EscPOSPrinter.convertReceiptToHTML();
        // retourner au client de la WebSocket les données
        EscPOSPrinter.sendPrintedReceipt(socketsForChannel, channelPOSPrinter);
	}

}
