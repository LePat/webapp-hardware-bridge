
// ============================================================
// EXEMPLE D'UTILISATION
// ============================================================

// Exemple 1: Créer un enregistrement avec prix unitaire
const record01 = CheckoutDialog06.createRecord01(12.3456);
console.log('Record 01 (Prix unitaire):');
console.log(CheckoutDialog06.formatBytes(record01));
console.log('');

// Exemple 2: Créer un enregistrement avec prix et tare
const record03 = CheckoutDialog06.createRecord03(12.3456, 2.50);
console.log('Record 03 (Prix + Tare):');
console.log(CheckoutDialog06.formatBytes(record03));
console.log('');

// Exemple 3: Créer un enregistrement avec prix et texte
const record04 = CheckoutDialog06.createRecord04(12.3456, 'POMMES');
console.log('Record 04 (Prix + Texte):');
console.log(CheckoutDialog06.formatBytes(record04));
console.log('');

// Exemple 4: Demande de données (ENQ)
const enq = CheckoutDialog06.createENQ();
console.log('ENQ (Demande de données):');
console.log(CheckoutDialog06.formatBytes(enq));
console.log('');

// Exemple 5: Parser une réponse ACK
const ackResponse = [CheckoutDialog06.ACK];
const parsedAck = CheckoutDialog06.identifyMessage(ackResponse);
console.log('Réponse parsée (ACK):', parsedAck);

// Export pour utilisation en module
if (typeof module !== 'undefined' && module.exports) {
	module.exports = CheckoutDialog06;
}