// ================
// Afficheur Client
// ================
var webSocketAfficheurClient;
var texte = "";

function connecterAfficheurClient() {
	if (webSocketAfficheurClient !== undefined) {
		webSocketAfficheurClient.close();
	}
	webSocketAfficheurClient = new WebSocket(document.getElementById("wsAfficheurClientURL").value);
	webSocketAfficheurClient.onmessage = webSocketAfficheurClientOnMessage;
}

function webSocketAfficheurClientOnMessage(event) {
	texte += event.data;
	if (texte.length > 20) {
		document.getElementById("afficheurClient").value = texte.substring(texte.length - 40, texte.length - 20) + "\n" + texte.substring(texte.length - 20, texte.length);
	}
}

// ================
// TakePOS
// ================
var webSocketTakePOS;

function connecterTakePOS() {
	if (webSocketTakePOS !== undefined) {
		webSocketTakePOS.close();
	}
	webSocketTakePOS = new WebSocket(document.getElementById("wsTakePOSURL").value);
	webSocketTakePOS.onmessage = webSocketTakePOSOnMessage;
}

/**
 * Etats de l'automate à états finis représentant l'utilisation du protocole par le client.
 */
var States = {
	'WAITING_FOR_COMMAND' : "En attente d'une commande",
	'SENDING_UNITPRICE_BEFORE_WEIGHING' : "Envoi du prix unitaire",
	'ACK_RECEIVED_FOR_UNITPRICE' : "Acquittement reçu suite à l'envoi du prix unitaire",
	'REQUESTED_WEIGHING_SCALE' : "Pesée demandée",
};

// Etat courant
var currentState = States.WAITING_FOR_COMMAND;

var currentWeight = 0;

function askForWeight(unitPrice) {
	currentState = States.SENDING_UNITPRICE_BEFORE_WEIGHING;
	console.log(currentState);
	envoyerUnitPrice(unitPrice);
}

function ENQ() {
	if (webSocketTakePOS !== undefined) {
		if (currentState == States.ACK_RECEIVED_FOR_UNITPRICE) {
			currentState = States.REQUESTED_WEIGHING_SCALE;
			console.log(currentState);
		}
		webSocketTakePOS.send(CheckoutDialog06.formatMessage(CheckoutDialog06.createENQ()));
	}
}

function pourquoiNAK() {
if (webSocketTakePOS !== undefined) {
	webSocketTakePOS.send(CheckoutDialog06.formatMessage(CheckoutDialog06.createRecord08()));
}
}

function envoyerCommandeTakePOS() {
	var tare = document.getElementById("tare").value;
	if (tare !== undefined && tare.length > 0) {
		envoyerUnitPriceAndTare();
	} else {
		var unitPrice = document.getElementById("unitPrice").value;
		if (unitPrice !== undefined == unitPrice.length > 0) {
			envoyerUnitPrice();
		}
	}
}

function envoyerUnitPrice() {
	if (webSocketTakePOS !== undefined) {
		webSocketTakePOS.send(
			String.fromCharCode(0x04, 0x02, 0x30, 0x31, 0x1b) +
			CheckoutDialog06.fromFloatAsStringToDialog06(document.getElementById("unitPrice").value) +
			String.fromCharCode(0x1b, 0x03)
		);
	}
}

function envoyerUnitPriceAndTare() {
	if (webSocketTakePOS !== undefined) {
		webSocketTakePOS.send(
			CheckoutDialog06.formatMessage(
				CheckoutDialog06.createRecord03(
					document.getElementById("unitPrice").value,
					document.getElementById("tare").value
				)
			)
		);
	}
}

function webSocketTakePOSOnMessage(event) {
	var texte = document.getElementById("balanceResponse").value;
	texte += event.data;
	texte = texte.substring(texte.length - 30, texte.length).replace("\n", " ");
	document.getElementById("balanceResponse").value = texte;
	var response = CheckoutDialog06.identifyMessage(event.data);
	document.getElementById("balanceStatus").value = "" + response.type + " " + response.data;
	if (response.type == 'ACK' && currentState == States.SENDING_UNITPRICE_BEFORE_WEIGHING) {
		currentState = States.ACK_RECEIVED_FOR_UNITPRICE;
		console.log(currentState);
		ENQ();
	}
	if (response.type == 'RECORD_02' && currentState == States.REQUESTED_WEIGHING_SCALE) {
		currentWeight = response.data.weight;
		currentState = States.WAITING_FOR_COMMAND;
		console.log(currentState);
		document.getElementById("receivedWeight").value = currentWeight;
	}
}

// ================
// Balance
// ================
var webSocketBalance;

function connecterBalance() {
	if (webSocketBalance !== undefined) {
		webSocketBalance.close();
	}
	webSocketBalance = new WebSocket(document.getElementById("wsBalanceURL").value);
	webSocketBalance.onmessage = webSocketBalanceOnMessage;
}

function acquitter() {
	webSocketBalance.send(String.fromCharCode(CheckoutDialog06.ACK));
}

function webSocketBalanceOnMessage(event) {
	var texte = document.getElementById("balanceRequest").value;
	texte += event.data;
	texte = texte.substring(texte.length - 25, texte.length);
	document.getElementById("balanceRequest").value = texte;
	if (document.getElementById("status").value.length > 0) {
		webSocketBalance.send(String.fromCharCode(0x15));
		return;
	}
	if (event.data == String.fromCharCode(0x04, 0x05)) {
		webSocketBalance.send(
			String.fromCharCode(
				0x02, 0x30, 0x32, 0x1b, // Record n°2
				0x33, 0x1b // Scale status: kg
			) +
			CheckoutDialog06.fromFloatAsStringToDialog06(document.getElementById("poids").value) + String.fromCharCode(0x1b) +
			CheckoutDialog06.fromFloatAsStringToDialog06(document.getElementById("receivedUnitPrice").value) + String.fromCharCode(0x1b) +
			CheckoutDialog06.fromFloatAsStringToDialog06("" + (parseFloat(document.getElementById("poids").value) * parseFloat(document.getElementById("receivedUnitPrice").value)).toFixed(3)) + String.fromCharCode(0x1b) +
			String.fromCharCode(0x03) // ETX
		);
	} else {
		var recordNumber = getRecordNumber(event.data);
		switch (recordNumber) {
			case 1:
				console.log("transmission of unit price");
				document.getElementById("receivedUnitPrice").value = CheckoutDialog06.fromDialog06ToFloat(extractUnitPrice(event.data, 5));
				acquitter();
				break;
			case 3:
				console.log("transmission of unit price and tare value");
				document.getElementById("receivedUnitPrice").value = CheckoutDialog06.fromDialog06ToFloat(extractUnitPrice(event.data, 5));
				document.getElementById("receivedTare").value = CheckoutDialog06.fromDialog06ToFloat(extractTare(event.data, 10));
				acquitter();
				break;
			case 4:
				console.log("transmission of unit price and text");
				document.getElementById("receivedUnitPrice").value = CheckoutDialog06.fromDialog06ToFloat(extractUnitPrice(event.data, 5));
				acquitter();
				break;
			case 5:
				console.log("transmission of unit price, tare value and text");
				document.getElementById("receivedUnitPrice").value = CheckoutDialog06.fromDialog06ToFloat(extractUnitPrice(event.data, 5));
				acquitter();
				break;
			case 8:
				console.log("demande de la raison du NAK");
				webSocketBalance.send(CheckoutDialog06.formatMessage(CheckoutDialog06.createRecord09(document.getElementById("erreur").value)));
				break;
		}
	}
}

// =================================
// Protocole Dialog-06 côté balance
// =================================
function getRecordNumber(data) {
	var header = data.substring(0, 2);
	if (header == String.fromCharCode(0x04, 0x02)) {
		var recordNumber = data.substring(2, 4);
		var separateur = data.substring(4, 5);
		if (separateur == String.fromCharCode(0x1b)) {
			return parseInt(recordNumber);
		} else {
			if (separateur == String.fromCharCode(CheckoutDialog06.ETX)) {
				return parseInt(recordNumber);
			}
			console.log("mauvais séparateur: " + separateur);
		}
	} else {
		console.log("mauvais header: " + header);
	}
}

function extractUnitPrice(data, startIndex) {
	var separateur = String.fromCharCode(0x1b);
	var index = startIndex;
	var charAtIndex = data.substring(index, index + 1);
	var price = "";
	while (charAtIndex != separateur) {
		price += charAtIndex;
		index++;
		charAtIndex = data.substring(index, index + 1);
	}
	return price;
}

function extractTare(data) {
	var separateur = String.fromCharCode(0x1b);
	return tare = data.split(separateur)[2].substring(0, 4);
}

// =================
// WebSocket de test
// =================
var webSocketTest;

function connecterConsole() {
	if (webSocketTest !== undefined) {
		webSocketTest.close();
	}
	webSocketTest = new WebSocket(document.getElementById("wsConsoleURL").value);
}

function envoyer() {
	webSocketTest.send(document.getElementById("wsConsoleText").value);
}