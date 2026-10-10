-- Entfernt die automatische Inaktivitäts-Erinnerung.
--
-- Sie schrieb Kunden an, die seit einer eingestellten Zeit nicht mehr da waren, und danach
-- immer wieder, bis sie zurückkamen. Eingerichtet wurde sie in der Betriebs-App unter
-- „Benachrichtigungen". Die Funktion fällt ersatzlos weg; geblieben ist die Nachricht an
-- alle Karteninhaber, sofort oder monatlich (`CardMessage`, `CardMonthlyMessage`).
--
-- WAS DIESES SKRIPT UNWIDERRUFLICH LÖSCHT: jede eingerichtete Erinnerung samt Text und
-- Intervall, und über den Fremdschlüssel (ON DELETE CASCADE) den Nachweis, welcher Kunde
-- wann eine davon bekommen hat. Betroffen sind ausschließlich diese beiden Tabellen —
-- Karten, Pässe, Stempelstände und die Stempel-Historie bleiben unangetastet.
--
-- Bereits verschickte Erinnerungen holt niemand zurück: Sie stehen auf den Telefonen der
-- Kunden und verschwinden dort nicht. Was hier gelöscht wird, ist nur die Einstellung,
-- dass es weitergehen soll.
--
-- Warum von Hand und nicht über `prisma db push`: Das Verwerfen von Daten verlangt dort
-- `--accept-data-loss`. Dieses Flag ins Deploy-Kommando zu schreiben würde jede künftige
-- versehentliche Löschung mit durchwinken. Der eine Schritt, der hier gewollt ist, steht
-- deshalb ausgeschrieben da.
--
-- Reihenfolge: erst die Zustellvermerke, dann die Erinnerungen. Der Fremdschlüssel würde
-- es zwar selbst erledigen, aber eine Tabelle zu löschen, auf die noch gezeigt wird, ist
-- unnötig vom Zufall der Reihenfolge abhängig.
--
-- Idempotent: nach dem ersten Durchlauf gibt es beide Tabellen nicht mehr, dann sind die
-- Anweisungen wirkungslos.

DROP TABLE IF EXISTS "CardReminderDelivery";
DROP TABLE IF EXISTS "CardReminder";
