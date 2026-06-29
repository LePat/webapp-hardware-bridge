package tigerworkshop.webapphardwarebridge.utils;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
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
		File receiptHTML = new File(FILENAME + HTML_EXTENSION);

		ProcessBuilder processBuilder = new ProcessBuilder("php", ESCPOS_TO_HTML, FILENAME + BINARY_EXTENSION);
		// stdout du script -> fichier HTML ; stderr -> stderr de la JVM. Évite le pompage
		// manuel des flux : plus de FileOutputStream à fermer (fuite sur exception) ni de
		// risque de deadlock de buffer de pipe (stderr drainé entièrement avant stdout).
		processBuilder.redirectOutput(receiptHTML);
		processBuilder.redirectError(ProcessBuilder.Redirect.INHERIT);

		Process process = processBuilder.start();
		try {
			process.waitFor();
		} finally {
			if (process.isAlive()) {
				process.destroy();
			}
		}
	}
	
	public static void sendPrintedReceipt(ConcurrentLinkedQueue<WsContext> concurrentLinkedQueue, String channelPOSPrinter) {
		// Files.readAllBytes et new String ne renvoient jamais null (ils jettent), donc
		// pas de garde null : succès -> on diffuse le HTML, IOException -> on diffuse "empty".
		try {
			byte[] fileContent = Files.readAllBytes(Paths.get(FILENAME + HTML_EXTENSION));
			String outputHTML = new String(fileContent, StandardCharsets.UTF_8);
			concurrentLinkedQueue.forEach(client -> client.send(outputHTML));
		} catch (IOException e) {
			System.err.println(e.getClass().getName() + ": " + e.getMessage());
			concurrentLinkedQueue.forEach(client -> client.send("empty"));
		}
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
