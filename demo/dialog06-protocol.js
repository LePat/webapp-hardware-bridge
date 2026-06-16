/**
 * Implémentation du protocole Checkout-Dialog 06 (Bizerba)
 * Communication entre terminal de caisse (POS) et balance
 */

class CheckoutDialog06 {
	// Caractères de contrôle
	static STX = 0x02;  // Start of Text
	static ETX = 0x03;  // End of Text
	static EOT = 0x04;  // End of Transmission
	static ENQ = 0x05;  // Enquiry
	static ACK = 0x06;  // Acknowledge
	static NAK = 0x15;  // Negative Acknowledge
	static ESC = 0x1B;  // Escape

	// Status de la balance
	static SCALE_STATUS = {
		'30': 'lb:oz / 1/8 oz',
		'31': 'lb / 0.01',
		'32': 'lb / 0.005',
		'33': 'kg'
	};

	// Codes d'erreur
	static ERROR_CODES = {
		'00': 'Pas d\'erreur',
		'01': 'Erreur générale sur la balance',
		'02': 'Erreur de parité ou trop de caractères',
		'10': 'Numéro d\'enregistrement incorrect',
		'11': 'Prix unitaire invalide',
		'12': 'Valeur de tare invalide',
		'13': 'Texte invalide',
		'20': 'Balance en mouvement (pas d\'équilibre)',
		'21': 'Pas de mouvement depuis la dernière pesée',
		'22': 'Calcul du prix non disponible',
		'30': 'Balance dans la plage MIN',
		'31': 'Balance en sous-charge ou poids négatif',
		'32': 'Balance en surcharge'
	};

	/**
	 * Convertit une chaîne en tableau de bytes
	 */
	static stringToBytes(str) {
		return Array.from(str).map(c => c.charCodeAt(0));
	}

	/**
	 * Convertit un tableau de bytes en chaîne
	 */
	static bytesToString(bytes) {
		return String.fromCharCode(...bytes);
	}

	/**
	 * Formate un nombre avec des zéros à gauche
	 */
	static padNumber(num, length) {
		return num.toString().padStart(length, '0');
	}

	/**
	 * Convertit un nombre en format hexadécimal ASCII
	 */
	static toHexAscii(num) {
		const hex = num.toString(16).toUpperCase();
		return hex.split('').map(c => c.charCodeAt(0));
	}

	// ============================================================
	// ENREGISTREMENTS POS → BALANCE
	// ============================================================

	/**
	 * Record 01: Transmission du prix unitaire
	 * @param {number} price - Prix unitaire (5 ou 6 chiffres)
	 */
	static createRecord01(price) {
		return [
			this.EOT,
			this.STX,
			...this.stringToBytes('01'),
			this.ESC,
			...this.stringToBytes(this.fromPriceToDialog06(price)),
			this.ESC,
			this.ETX
		];
	}

	/**
	 * Record 03: Transmission du prix unitaire et tare
	 * @param {number} price - Prix unitaire (5 ou 6 chiffres)
	 * @param {number} tare - Valeur de tare (4 chiffres)
	 */
	static createRecord03(price, tare) {
		return [
			this.EOT,
			this.STX,
			...this.stringToBytes('03'),
			this.ESC,
			...this.stringToBytes(this.fromPriceToDialog06(price)),
			this.ESC,
			...this.stringToBytes(this.fromFloatToDialog06(tare, true)),
			this.ETX
		];
	}

	/**
	 * Record 04: Transmission du prix unitaire et texte
	 * @param {number} price - Prix unitaire (5 ou 6 chiffres)
	 * @param {string} text - Texte (13 caractères max)
	 */
	static createRecord04(price, text) {
		const textPadded = text.padEnd(13, ' ').substring(0, 13);
		return [
			this.EOT,
			this.STX,
			...this.stringToBytes('04'),
			this.ESC,
			...this.stringToBytes(this.fromPriceToDialog06(price)),
			this.ESC,
			...this.stringToBytes(textPadded),
			this.ETX
		];
	}

	/**
	 * Record 05: Transmission du prix unitaire, tare et texte
	 * @param {number} price - Prix unitaire (5 ou 6 chiffres)
	 * @param {number} tare - Valeur de tare (4 chiffres)
	 * @param {string} text - Texte (13 caractères max)
	 */
	static createRecord05(price, tare, text) {
		const textPadded = text.padEnd(13, ' ').substring(0, 13);
		return [
			this.EOT,
			this.STX,
			...this.stringToBytes('05'),
			this.ESC,
			...this.stringToBytes(this.fromPriceToDialog06(price)),
			this.ESC,
			...this.stringToBytes(this.fromFloatToDialog06(tare, true)),
			this.ESC,
			...this.stringToBytes(textPadded),
			this.ETX
		];
	}

	/**
	 * Record 08: Demande d'information de status après NAK
	 */
	static createRecord08() {
		return [
			this.EOT,
			this.STX,
			...this.stringToBytes('08'),
			this.ETX
		];
	}
	
	/**
	 * Record 09: Transmission de la raison du NAK
	 * @param {String} error
	 */
	static createRecord09(error) {
		return [
			this.STX,
			...this.stringToBytes('09'),
			this.ESC,
			...this.stringToBytes(error),
			this.ETX
		];
	}

	/**
	 * Record 10: Transmission des checksums et valeurs de correction
	 * @param {Array} checksumPairs - Array de {checksum, correctionValue}
	 */
	static createRecord10(checksumPairs) {
		const data = [
			this.EOT,
			this.STX,
			...this.stringToBytes('10'),
			this.ESC
		];

		for (const pair of checksumPairs) {
			data.push(...this.toHexAscii(pair.checksum));
			data.push(...this.toHexAscii(pair.correctionValue));
		}

		data.push(this.ETX);
		return data;
	}
	
	/**
	 * Record 11: Demande de checksum
	 */
	static createRecord11() {
		return [
			this.STX,
			...this.stringToBytes('11'),
			this.ESC,
			...this.stringToBytes('2EF'),
			this.ETX
		];
	}

	/**
	 * Record 20: Active/désactive le numéro de version logique
	 * @param {boolean} enable - true pour ON, false pour OFF
	 */
	static createRecord20(enable) {
		return [
			this.EOT,
			this.STX,
			...this.stringToBytes('20'),
			this.ESC,
			enable ? 0x31 : 0x30, // '1' ou '0'
			this.ETX
		];
	}

	/**
	 * ENQ: Demande de données de la balance
	 */
	static createENQ() {
		return [this.EOT, this.ENQ];
	}

	/**
	 * EOT: Standardisation de la balance
	 */
	static createEOT() {
		return [this.EOT];
	}

	// ============================================================
	// PARSERS POUR ENREGISTREMENTS BALANCE -> POS
	// ============================================================

	/**
	 * Parse Record 02: Valeur de poids valide
	 */
	static parseRecord02(bytes) {
		// Extraction des données (positions approximatives)
		const parts = bytes.split(String.fromCharCode(this.ESC));

		return {
			recordNo: '02',
			scaleStatus: parts[1] ? parts[1].charAt(0) : null,
			scaleStatusText: this.SCALE_STATUS[parts[1]?.charCodeAt(0).toString()],
			weight: parts[2] ? this.fromDialog06ToFloat(parts[2].trim()) : null,
			unitPrice: parts[3] ? parts[3].trim() : null,
			sellingPrice: parts[4] ? parts[4].trim() : null
		};
	}

	/**
	 * Parse Record 09: Information de status après NAK
	 */
	static parseRecord09(bytes) {
		const str = this.bytesToString(bytes);
		const parts = str.split(String.fromCharCode(this.ESC));

		if (parts[1] && parts[1].length >= 2) {
			const statusCode = parts[1].substring(0, 2);
			return {
				recordNo: '09',
				statusCode: statusCode,
				errorMessage: this.ERROR_CODES[statusCode] || 'Erreur inconnue'
			};
		}

		return {
			recordNo: '09',
			statusCode: 'unknown',
			errorMessage: 'Format invalide'
		};
	}

	/**
	 * Parse Record 11: Réponse ou demande de checksum
	 */
	static parseRecord11(bytes) {
		const str = this.bytesToString(bytes);
		const parts = str.split(String.fromCharCode(this.ESC));

		if (parts[1] && parts[1].length >= 1) {
			const status = parts[1].charAt(0);
			const result = {
				recordNo: '11',
				status: status
			};

			switch (status) {
				case '0': // 30H
					result.message = 'Vérification non conforme';
					break;
				case '1': // 31H
					result.message = 'Vérification conforme';
					break;
				case '2': // 32H
					result.message = 'Retransmission du record 10 demandée';
					result.randomNumber = parts[1].substring(1);
					break;
			}

			return result;
		}

		return {
			recordNo: '11',
			status: 'unknown',
			message: 'Format invalide'
		};
	}

	/**
	 * Identifie le type de message reçu
	 */
	static identifyMessage(bytes) {
		if (bytes.length === 0) return null;

		// ACK
		if (bytes[0] === String.fromCharCode(this.ACK)) {
			return { type: 'ACK', message: 'Acquittement positif' };
		}

		// NAK
		if (bytes[0] === String.fromCharCode(this.NAK)) {
			return { type: 'NAK', message: 'Acquittement négatif' };
		}

		// Records (commencent par STX)
		if (bytes[0] === String.fromCharCode(this.STX) && bytes.length >= 3) {
			const recordNo = bytes.slice(1, 3);

			switch (recordNo) {
				case '02':
					return { type: 'RECORD_02', data: this.parseRecord02(bytes) };
				case '09':
					return { type: 'RECORD_09', data: this.parseRecord09(bytes) };
				case '11':
					return { type: 'RECORD_11', data: this.parseRecord11(bytes) };
				default:
					return { type: 'UNKNOWN_RECORD', recordNo };
			}
		}

		return { type: 'UNKNOWN', bytes };
	}

	/**
	 * Transforme un prix du protocole, 3 chiffres après la virgule.
	 */
	static fromDialog06ToPrice(data) {
		var flottant = parseInt(data.substring(data.length - 3, data.length)) / 1000;
		flottant += parseInt(data.substring(0, data.length - 3));
		return flottant;
	}

	/**
	 * Transforme un nombre du protocole, 3 chiffres après la virgule.
	 */
	static fromDialog06ToFloat(data) {
		var flottant = parseInt(data.substring(data.length - 3, data.length)) / 1000;
		flottant += parseInt(data.substring(0, data.length - 3));
		return flottant;
	}

	/**
	 * Transforme un flottant en nombre du protocole.
	 */
	static fromFloatToDialog06(flottant, tare = false) {
		var number = flottant.toString();
		var numberSplitted = number.split(".");
		var nombreDialog06 =
			numberSplitted[0].padStart((tare ? 1 : 3), "0") + 
			(numberSplitted.length == 2 ? numberSplitted[1].padEnd(3, "0") : "000");
		return nombreDialog06;
	}
	
	/**
	 * Encode un prix unitaire au format Dialog-06 (6 chiffres, 2 décimales fixes).
	 */
    static fromPriceToDialog06(price) {
        var cents = Math.round(price * 100);
        return cents.toString().padStart(6, "0");
    }

	/**
	 * Transforme un prix représenté dans une chaine de caractères en nombre du protocole.
	 */
	static fromPriceAsStringToDialog06(number) {
		var flottant = parseFloat(number);
		return this.fromPriceToDialog06(flottant);
	}

	/**
	 * Transforme un flottant représenté dans une chaine de caractères en nombre du protocole.
	 */
	static fromFloatAsStringToDialog06(number) {
		var flottant = parseFloat(number);
		return this.fromFloatToDialog06(flottant);
	}

	/**
	 * Formatte un tableau de bytes pour l'affichage (hex + ASCII)
	 */
	static formatBytes(bytes) {
		const hex = bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
		const ascii = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
		return `HEX: ${hex}\nASCII: ${ascii}`;
	}

	/**
	 * Formatte un tableau de bytes pour l'affichage (hex + ASCII)
	 */
	static formatMessage(bytes) {
		return bytes.map(b => String.fromCharCode(b)).join('');
	}
}
