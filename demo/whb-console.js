// =================================
// Gestion commune des WebSockets
// =================================

// Délai avant tentative de reconnexion automatique (ms).
const DELAI_RECONNEXION = 1000;

// Timers de reconnexion en attente, indexés par statusId, pour éviter
// de lancer plusieurs chaînes de reconnexion en parallèle sur un même socket.
var timersReconnexion = {};

/**
 * Construit l'URL de connexion à partir de l'URL de base saisie, en
 * appliquant le mode crypté (ws -> wss) et le token d'authentification.
 */
function construireURL(urlBase) {
	var url = urlBase;
	if (document.getElementById("modeCrypte").checked) {
		url = url.replace(/^ws:\/\//i, "wss://");
	}
	var token = document.getElementById("authToken").value;
	if (token && token.length > 0) {
		url += (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(token);
	}
	return url;
}

/**
 * Met à jour la pastille d'état d'un socket.
 * etat: "connexion" | "ouvert" | "ferme"
 */
function majEtat(statusId, etat) {
	var element = document.getElementById(statusId);
	if (element === null) {
		return;
	}
	element.className = "etat etat-" + etat;
	element.title = {
		"connexion": "Connexion en cours…",
		"ouvert": "Connecté",
		"ferme": "Déconnecté (reconnexion auto)"
	}[etat] || etat;
}

// Noms lisibles des caractères de contrôle du protocole Dialog-06.
const NOMS_CONTROLE = {
	0x02: "STX", 0x03: "ETX", 0x04: "EOT", 0x05: "ENQ",
	0x06: "ACK", 0x15: "NAK", 0x1b: "ESC"
};

/**
 * Décrit une trame (chaîne de bytes) sous forme lisible + hex.
 * - lisible : caractères imprimables tels quels, contrôles entre chevrons (<STX>…)
 * - hex     : suite des octets en hexadécimal
 */
function decrireTrame(data) {
	var hex = [];
	var lisible = "";
	for (var i = 0; i < data.length; i++) {
		var code = data.charCodeAt(i);
		hex.push(code.toString(16).padStart(2, "0").toUpperCase());
		if (NOMS_CONTROLE[code]) {
			lisible += "<" + NOMS_CONTROLE[code] + ">";
		} else if (code >= 32 && code <= 126) {
			lisible += data.charAt(i);
		} else {
			lisible += "<" + code.toString(16).padStart(2, "0").toUpperCase() + ">";
		}
	}
	return { lisible: lisible, hex: hex.join(" ") };
}

/**
 * Ajoute une entrée au journal des échanges.
 * libelle : "TakePOS" | "Balance" ; sens : "envoi" | "reçu"
 */
function journaliser(libelle, sens, data) {
	var journal = document.getElementById("journal");
	if (journal === null || data === undefined || data === null || data.length === 0) {
		return;
	}
	var trame = decrireTrame("" + data);
	var heure = new Date().toLocaleTimeString();
	var fleche = (sens === "envoi") ? "→" : "←";
	var ligne = "[" + heure + "] " + libelle.padEnd(8) + fleche + " " + trame.lisible + "    |  " + trame.hex;
	journal.value += (journal.value ? "\n" : "") + ligne;
	journal.scrollTop = journal.scrollHeight;
}

/**
 * Ouvre un WebSocket robuste avec reconnexion automatique.
 * opts: { urlInputId, onMessage, statusId, setSocket, libelle, journal }
 * - setSocket(ws) permet de stocker le socket courant dans la variable globale
 *   correspondante, afin que les fonctions d'envoi utilisent toujours le bon.
 * - libelle/journal : si journal=true, les trames envoyées/reçues sont
 *   journalisées sous le libellé donné.
 */
function connecterWebSocket(opts) {
	// Annule une reconnexion déjà programmée pour ce socket.
	if (timersReconnexion[opts.statusId]) {
		clearTimeout(timersReconnexion[opts.statusId]);
		delete timersReconnexion[opts.statusId];
	}

	var url = construireURL(document.getElementById(opts.urlInputId).value);
	majEtat(opts.statusId, "connexion");

	var ws = new WebSocket(url);

	ws.onopen = function() {
		majEtat(opts.statusId, "ouvert");
	};

	ws.onmessage = function(event) {
		if (opts.journal) {
			journaliser(opts.libelle, "reçu", event.data);
		}
		if (opts.onMessage) {
			opts.onMessage(event);
		}
	};

	// Journalise aussi les trames sortantes en interceptant send().
	if (opts.journal) {
		var envoiOriginal = ws.send.bind(ws);
		ws.send = function(data) {
			journaliser(opts.libelle, "envoi", data);
			return envoiOriginal(data);
		};
	}

	ws.onerror = function(error) {
		console.error("Erreur WebSocket sur " + url + ": ", error);
		// onclose suivra et déclenchera la reconnexion.
	};

	ws.onclose = function() {
		majEtat(opts.statusId, "ferme");
		console.log("WebSocket " + url + " fermée, reconnexion dans " + DELAI_RECONNEXION + "ms");
		timersReconnexion[opts.statusId] = setTimeout(function() {
			connecterWebSocket(opts);
		}, DELAI_RECONNEXION);
	};

	opts.setSocket(ws);
	return ws;
}

/**
 * Ferme proprement un socket existant sans déclencher la reconnexion auto.
 */
function fermerProprement(ws) {
	if (ws !== undefined && ws !== null) {
		ws.onclose = null;
		ws.onerror = null;
		ws.close();
	}
}

/**
 * (Re)connecte tous les sockets : utilisé au chargement et au changement
 * de mode crypté / token.
 */
function reconnecterTout() {
	connecterAfficheurClient();
	connecterTakePOS();
	connecterBalance();
	connecterPOSPrinter();
	connecterConsole();
}

/**
 * Peuple le sélecteur de codes d'erreur à renvoyer depuis ERROR_CODES,
 * pour conserver une source unique des codes Dialog-06.
 */
function remplirCodesErreur() {
	var select = document.getElementById("erreur");
	if (select === null) {
		return;
	}
	Object.keys(CheckoutDialog06.ERROR_CODES).forEach(function(code) {
		var option = document.createElement("option");
		option.value = code;
		option.textContent = code + " — " + CheckoutDialog06.ERROR_CODES[code];
		if (code === "11") {
			option.selected = true;
		}
		select.appendChild(option);
	});
}

/**
 * Vide le journal des échanges.
 */
function viderJournal() {
	var journal = document.getElementById("journal");
	if (journal !== null) {
		journal.value = "";
	}
}

/**
 * Réinitialise l'état de la simulation : journal, trames affichées, champs
 * reçus et automates à états finis. Ne touche pas aux connexions.
 */
function reinitialiser() {
	["journal", "balanceResponse", "balanceStatus", "balanceRequest",
	 "receivedWeight", "receivedUnitPrice", "receivedTare", "receivedText"
	].forEach(function(id) {
		var element = document.getElementById(id);
		if (element !== null) {
			element.value = "";
		}
	});

	currentStateClient = ClientStates.WAITING_FOR_COMMAND;
	currentStateBalance = WeighingScaleStates.WAITING_FOR_COMMAND;
	currentWeight = 0;
	nombreDeRequetes = 0;
}

// ================
// Afficheur Client
// ================
var webSocketAfficheurClient;
var texte = "";

function connecterAfficheurClient() {
	fermerProprement(webSocketAfficheurClient);
	connecterWebSocket({
		urlInputId: "wsAfficheurClientURL",
		onMessage: webSocketAfficheurClientOnMessage,
		statusId: "statusAfficheurClient",
		setSocket: function(ws) { webSocketAfficheurClient = ws; }
	});
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
	fermerProprement(webSocketTakePOS);
	connecterWebSocket({
		urlInputId: "wsTakePOSURL",
		onMessage: webSocketTakePOSOnMessage,
		statusId: "statusTakePOS",
		libelle: "TakePOS",
		journal: true,
		setSocket: function(ws) { webSocketTakePOS = ws; }
	});
}

/**
 * Etats de l'automate à états finis représentant l'utilisation du protocole par le client.
 */
var ClientStates = {
	'WAITING_FOR_COMMAND' : "En attente d'une commande",
	'SENDING_UNITPRICE_BEFORE_WEIGHING' : "Envoi du prix unitaire",
	'ACK_RECEIVED_FOR_UNITPRICE' : "Acquittement reçu suite à l'envoi du prix unitaire",
	'REQUESTED_WEIGHING_SCALE' : "Pesée demandée",
	'CHECKSUM' : "Demande de somme de contrôle",
};

// Etat courant du client
var currentStateClient = ClientStates.WAITING_FOR_COMMAND;

var currentWeight = 0;

function askForWeight(unitPrice) {
	currentStateClient = ClientStates.SENDING_UNITPRICE_BEFORE_WEIGHING;
	console.log(currentStateClient);
	sendUnitPrice(unitPrice);
}

function ENQ() {
	if (webSocketTakePOS !== undefined) {
		if (currentStateClient == ClientStates.ACK_RECEIVED_FOR_UNITPRICE) {
			currentStateClient = ClientStates.REQUESTED_WEIGHING_SCALE;
			console.log(currentStateClient);
		}
		webSocketTakePOS.send(CheckoutDialog06.formatMessage(CheckoutDialog06.createENQ()));
	}
}

function pourquoiNAK() {
if (webSocketTakePOS !== undefined) {
	webSocketTakePOS.send(CheckoutDialog06.formatMessage(CheckoutDialog06.createRecord08()));
}
}

/**
 * Choisit et envoie le bon enregistrement selon les champs renseignés :
 *   prix seul            -> Record 01
 *   prix + tare          -> Record 03
 *   prix + texte         -> Record 04
 *   prix + tare + texte  -> Record 05
 */
function envoyerCommandeTakePOS() {
	var prix = document.getElementById("unitPrice").value;
	if (prix === undefined || prix.length === 0) {
		return;
	}
	var tare = document.getElementById("tare").value;
	var texte = document.getElementById("text").value;
	var aTare = tare !== undefined && tare.length > 0;
	var aTexte = texte !== undefined && texte.length > 0;

	var trame;
	if (aTare && aTexte) {
		trame = CheckoutDialog06.createRecord05(prix, tare, texte);
	} else if (aTare) {
		trame = CheckoutDialog06.createRecord03(prix, tare);
	} else if (aTexte) {
		trame = CheckoutDialog06.createRecord04(prix, texte);
	} else {
		trame = CheckoutDialog06.createRecord01(prix);
	}
	envoyerTakePOS(CheckoutDialog06.formatMessage(trame));
}

/**
 * Envoie une trame déjà formatée sur le socket TakePOS, si connecté.
 */
function envoyerTakePOS(trame) {
	if (webSocketTakePOS !== undefined) {
		webSocketTakePOS.send(trame);
	}
}

function sendUnitPrice() {
	envoyerTakePOS(
		CheckoutDialog06.formatMessage(
			CheckoutDialog06.createRecord01(document.getElementById("unitPrice").value)
		)
	);
}

function webSocketTakePOSOnMessage(event) {
	var texte = document.getElementById("balanceResponse").value;
	texte += event.data;
	texte = texte.substring(texte.length - 30, texte.length).replace("\n", " ");
	document.getElementById("balanceResponse").value = texte;
	var response = CheckoutDialog06.identifyMessage(event.data);
	console.log("receives data: " + JSON.stringify(response.data));
	document.getElementById("balanceStatus").value = "" + response.type + " " + response.data;
	if (response.type == 'ACK' && currentStateClient == ClientStates.SENDING_UNITPRICE_BEFORE_WEIGHING) {
		currentStateClient = ClientStates.ACK_RECEIVED_FOR_UNITPRICE;
		console.log(currentStateClient);
		ENQ();
	}
	if (response.type == 'RECORD_02' && currentStateClient == ClientStates.REQUESTED_WEIGHING_SCALE) {
		currentWeight = response.data.weight;
		currentStateClient = ClientStates.WAITING_FOR_COMMAND;
		console.log(currentStateClient);
		document.getElementById("receivedWeight").value = currentWeight;
	}
	if (response.type == 'RECORD_11' && currentStateClient == ClientStates.REQUESTED_WEIGHING_SCALE) {
		currentStateClient = ClientStates.CHECKSUM;
		console.log(currentStateClient);
		checksum = response.data.randomNumber.charAt(0);
		correctionValue = response.data.randomNumber.charAt(1)
		checksumPair = [{ checksum, correctionValue}];
		webSocketTakePOS.send(CheckoutDialog06.formatMessage(CheckoutDialog06.createRecord10(checksumPair)));
	}
}

// ================
// Balance
// ================
var webSocketBalance;

/**
 * Etats de l'automate à états finis représentant l'utilisation du protocole par la balance.
 */
var WeighingScaleStates = {
	'WAITING_FOR_COMMAND' : "En attente d'une commande",
	'REQUESTED_CHECHSUM' : "Somme de contrôle demandée",
};

// Etat courant de la balance
var currentStateBalance = WeighingScaleStates.WAITING_FOR_COMMAND;

const nombreRequetesAvantCheck = 2;

var nombreDeRequetes = 0;

function connecterBalance() {
	fermerProprement(webSocketBalance);
	connecterWebSocket({
		urlInputId: "wsBalanceURL",
		onMessage: webSocketBalanceOnMessage,
		statusId: "statusBalance",
		libelle: "Balance",
		journal: true,
		setSocket: function(ws) { webSocketBalance = ws; }
	});
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
	// ENQ : demande de pesée
	if (event.data == String.fromCharCode(0x04, 0x05)) {
		if (nombreDeRequetes > nombreRequetesAvantCheck) {
			// Demander un check
			currentStateBalance = WeighingScaleStates.REQUESTED_CHECHSUM;
			console.log(currentStateBalance);
			webSocketBalance.send(
				CheckoutDialog06.formatMessage(CheckoutDialog06.createRecord11())		
			);
			nombreDeRequetes = 0;
		}
		webSocketBalance.send(
			String.fromCharCode(
				0x02, 0x30, 0x32, 0x1b, // Record n°2
				0x33, 0x1b // Scale status: kg
			) +
			CheckoutDialog06.fromFloatAsStringToDialog06(document.getElementById("poids").value) + String.fromCharCode(0x1b) +
			CheckoutDialog06.fromPriceAsStringToDialog06(document.getElementById("receivedUnitPrice").value) + String.fromCharCode(0x1b) +
			CheckoutDialog06.fromFloatAsStringToDialog06("" + (parseFloat(document.getElementById("poids").value) * parseFloat(document.getElementById("receivedUnitPrice").value)).toFixed(3)) + String.fromCharCode(0x1b) +
			String.fromCharCode(0x03) // ETX
		);
		nombreDeRequetes++;
	} else {
		var recordNumber = getRecordNumber(event.data);
		switch (recordNumber) {
			case 1:
				console.log("transmission of unit price");
				document.getElementById("receivedUnitPrice").value = CheckoutDialog06.fromDialog06ToPrice(extractUnitPrice(event.data, 5));
				acquitter();
				break;
			case 3:
				console.log("transmission of unit price and tare value");
				document.getElementById("receivedUnitPrice").value = CheckoutDialog06.fromDialog06ToPrice(extractUnitPrice(event.data, 5));
				document.getElementById("receivedTare").value = CheckoutDialog06.fromDialog06ToFloat(extractTare(event.data, 10));
				acquitter();
				break;
			case 4:
				console.log("transmission of unit price and text");
				document.getElementById("receivedUnitPrice").value = CheckoutDialog06.fromDialog06ToPrice(extractUnitPrice(event.data, 5));
				document.getElementById("receivedText").value = extractText(event.data);
				acquitter();
				break;
			case 5:
				console.log("transmission of unit price, tare value and text");
				document.getElementById("receivedUnitPrice").value = CheckoutDialog06.fromDialog06ToPrice(extractUnitPrice(event.data, 5));
				document.getElementById("receivedTare").value = CheckoutDialog06.fromDialog06ToFloat(extractTare(event.data));
				document.getElementById("receivedText").value = extractText(event.data);
				acquitter();
				break;
			case 8:
				console.log("demande de la raison du NAK");
				webSocketBalance.send(CheckoutDialog06.formatMessage(CheckoutDialog06.createRecord09(document.getElementById("erreur").value)));
				break;
			case 10:
				console.log("réponse en vérification du checksum");
				if (currentStateBalance == WeighingScaleStates.REQUESTED_CHECHSUM) {
					acquitter();
				}
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

/**
 * Extrait le texte d'un record 04/05 : dernier segment entre ESC, sans l'ETX.
 */
function extractText(data) {
	var separateur = String.fromCharCode(0x1b);
	var parts = data.split(separateur);
	var dernier = parts[parts.length - 1];
	return dernier.replace(String.fromCharCode(0x03), "").trim();
}

// =================
// WebSocket de test
// =================
var webSocketTest;

function connecterConsole() {
	fermerProprement(webSocketTest);
	connecterWebSocket({
		urlInputId: "wsConsoleURL",
		onMessage: null,
		statusId: "statusConsole",
		setSocket: function(ws) { webSocketTest = ws; }
	});
}

function envoyer() {
	webSocketTest.send(document.getElementById("wsConsoleText").value);
}

// ==========================
// Imprimante ESC-POS de test
// ==========================
var webSocketImprimanteESCPOS;

function connecterPOSPrinter() {
	fermerProprement(webSocketImprimanteESCPOS);
	connecterWebSocket({
		urlInputId: "wsPOSPrinterURL",
		onMessage: posPrinterOnMessage,
		statusId: "statusPOSPrinter",
		setSocket: function(ws) { webSocketImprimanteESCPOS = ws; }
	});
}

function imprimer() {
	webSocketImprimanteESCPOS.send(JSON.stringify({
		"type" : "test",
		"raw_content": "\"" + document.getElementById("wsPOSPrinterText").value + "\""
	}));
}

function posPrinterOnMessage(event) {
	document.getElementById("wsPOSPrinterOutputContent").innerHTML = event.data;
}
