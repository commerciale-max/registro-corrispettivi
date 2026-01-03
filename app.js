// ==========================================
// REGISTRO CORRISPETTIVI - APP JAVASCRIPT
// ==========================================

// Configurazione API - USA IL PROXY LOCALE
const API_CONFIG = {
    proxyUrl: '/api/proxy',  // Proxy su Vercel che risolve CORS
    endpoints: {
        receipts: '/IT-receipts',
        configurations: '/IT-configurations'
    }
};

// Stato dell'applicazione
let appState = {
    token: localStorage.getItem('api_token') || '',
    ambiente: localStorage.getItem('api_ambiente') || 'sandbox',
    configurazione: JSON.parse(localStorage.getItem('configurazione') || '{}'),
    articoliCorrente: [],
    scontrini: JSON.parse(localStorage.getItem('scontrini') || '[]'),
    scontrinoSelezionato: null,
    sessionStart: null
};

// Timeout sessione (30 minuti)
const SESSION_TIMEOUT = 30 * 60 * 1000;
let sessionTimer = null;

// ==========================================
// FUNZIONE API CENTRALIZZATA (USA PROXY)
// ==========================================

async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + appState.token,
        'X-Api-Endpoint': endpoint,
        'X-Api-Environment': appState.ambiente
    };

    const options = {
        method: method,
        headers: headers
    };

    if (body && (method === 'POST' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(API_CONFIG.proxyUrl, options);
    return response;
}

// ==========================================
// AUTENTICAZIONE
// ==========================================

function checkSession() {
    const sessionData = localStorage.getItem('session_start');
    if (sessionData) {
        const sessionStart = parseInt(sessionData);
        const now = Date.now();
        if (now - sessionStart < SESSION_TIMEOUT) {
            appState.sessionStart = sessionStart;
            resetSessionTimer();
            return true;
        }
    }
    return false;
}

function resetSessionTimer() {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
        logout();
        showToast('Sessione scaduta', 'Effettua nuovamente il login', 'warning');
    }, SESSION_TIMEOUT);
    localStorage.setItem('session_start', Date.now().toString());
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function login() {
    const password = document.getElementById('login-password').value;
    if (!password) {
        showToast('Errore', 'Inserisci la password', 'danger');
        return;
    }

    const hash = await hashPassword(password);
    const storedHash = localStorage.getItem('app_password_hash');

    if (!storedHash) {
        // Prima configurazione - salva la password
        localStorage.setItem('app_password_hash', hash);
        appState.sessionStart = Date.now();
        localStorage.setItem('session_start', appState.sessionStart.toString());
        resetSessionTimer();
        showMainApp();
        showToast('Benvenuto', 'Password impostata con successo', 'success');
    } else if (hash === storedHash) {
        appState.sessionStart = Date.now();
        localStorage.setItem('session_start', appState.sessionStart.toString());
        resetSessionTimer();
        showMainApp();
    } else {
        showToast('Errore', 'Password non corretta', 'danger');
        document.getElementById('login-password').value = '';
    }
}

function logout() {
    if (sessionTimer) clearTimeout(sessionTimer);
    localStorage.removeItem('session_start');
    appState.sessionStart = null;
    document.getElementById('main-app').classList.add('d-none');
    document.getElementById('login-screen').classList.remove('d-none');
    document.getElementById('login-password').value = '';
}

function showMainApp() {
    document.getElementById('login-screen').classList.add('d-none');
    document.getElementById('main-app').classList.remove('d-none');
    
    // Sincronizza dati da OpenAPI dopo il login
    setTimeout(() => {
        if (appState.token) {
            sincronizzaDaAPI(false).then(() => {
                aggiornaStatistiche();
            });
        }
    }, 500);
}

// Reset attività utente
document.addEventListener('click', resetSessionTimer);
document.addEventListener('keypress', resetSessionTimer);

// ==========================================
// INIZIALIZZAZIONE
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    // Controlla sessione esistente
    if (checkSession()) {
        showMainApp();
    }

    // Imposta data corrente
    const oggi = new Date();
    document.getElementById('current-date').textContent = oggi.toLocaleDateString('it-IT', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Imposta date filtri
    const dataInizio = document.getElementById('filtro-data-inizio');
    const dataFine = document.getElementById('filtro-data-fine');
    if (dataInizio) dataInizio.valueAsDate = oggi;
    if (dataFine) dataFine.valueAsDate = oggi;

    // Carica configurazione
    caricaConfigurazione();
    
    // Aggiorna statistiche
    aggiornaStatistiche();
    
    // Verifica configurazione
    checkConfigurazione();

    // Enter per login
    document.getElementById('login-password')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });
});

// ==========================================
// NAVIGAZIONE
// ==========================================

function showSection(sectionId) {
    // Nascondi tutte le sezioni
    document.querySelectorAll('section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Mostra la sezione richiesta
    document.getElementById('section-' + sectionId).classList.remove('hidden');
    
    // Aggiorna nav
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[onclick="showSection('${sectionId}')"]`)?.classList.add('active');

    // Carica dati specifici per sezione
    if (sectionId === 'registro') {
        caricaRegistro();
    } else if (sectionId === 'configurazione') {
        caricaConfigurazione();
    }
}

// ==========================================
// STATISTICHE DASHBOARD
// ==========================================

function aggiornaStatistiche() {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    
    const scontriniOggi = appState.scontrini.filter(s => {
        const data = new Date(s.dataOra);
        data.setHours(0, 0, 0, 0);
        return data.getTime() === oggi.getTime() && s.stato !== 'annullato';
    });

    const totaleOggi = scontriniOggi.reduce((sum, s) => sum + s.totale, 0);
    const numeroOggi = scontriniOggi.length;

    // Calcola IVA
    let totaleIva = 0;
    scontriniOggi.forEach(s => {
        s.articoli.forEach(a => {
            totaleIva += a.importoIva || 0;
        });
    });

    document.getElementById('totale-oggi').textContent = formatCurrency(totaleOggi);
    document.getElementById('numero-scontrini').textContent = numeroOggi;
    document.getElementById('totale-iva').textContent = formatCurrency(totaleIva);
}

// ==========================================
// NUOVO SCONTRINO
// ==========================================

function mostraNuovoScontrino() {
    appState.articoliCorrente = [];
    aggiornaListaArticoli();
    
    // Reset campi
    document.getElementById('descrizione-articolo').value = '';
    document.getElementById('importo-lordo').value = '';
    document.getElementById('aliquota-iva').value = '22';
    document.getElementById('metodo-pagamento').value = 'contanti';
    
    const modal = new bootstrap.Modal(document.getElementById('modal-nuovo-scontrino'));
    modal.show();
}

function calcolaScorporo() {
    const importoLordo = parseFloat(document.getElementById('importo-lordo').value) || 0;
    const aliquota = parseFloat(document.getElementById('aliquota-iva').value) || 22;
    
    const importoNetto = importoLordo / (1 + aliquota / 100);
    const importoIva = importoLordo - importoNetto;
    
    document.getElementById('importo-netto-preview').textContent = formatCurrency(importoNetto);
    document.getElementById('iva-preview').textContent = formatCurrency(importoIva);
}

function aggiungiArticolo() {
    const descrizione = document.getElementById('descrizione-articolo').value.trim();
    const importoLordo = parseFloat(document.getElementById('importo-lordo').value) || 0;
    const aliquota = parseFloat(document.getElementById('aliquota-iva').value) || 22;

    if (!descrizione) {
        showToast('Attenzione', 'Inserisci una descrizione', 'warning');
        return;
    }
    if (importoLordo <= 0) {
        showToast('Attenzione', 'Inserisci un importo valido', 'warning');
        return;
    }

    const importoNetto = importoLordo / (1 + aliquota / 100);
    const importoIva = importoLordo - importoNetto;

    appState.articoliCorrente.push({
        id: generateId(),
        descrizione: descrizione,
        quantita: 1,
        aliquotaIva: aliquota,
        importoNetto: importoNetto,
        importoIva: importoIva,
        importoLordo: importoLordo
    });

    // Reset campi
    document.getElementById('descrizione-articolo').value = '';
    document.getElementById('importo-lordo').value = '';
    document.getElementById('importo-netto-preview').textContent = '€ 0,00';
    document.getElementById('iva-preview').textContent = '€ 0,00';

    aggiornaListaArticoli();
}

function rimuoviArticolo(id) {
    appState.articoliCorrente = appState.articoliCorrente.filter(a => a.id !== id);
    aggiornaListaArticoli();
}

function aggiornaListaArticoli() {
    const lista = document.getElementById('lista-articoli');
    const totaleEl = document.getElementById('totale-scontrino');
    
    if (appState.articoliCorrente.length === 0) {
        lista.innerHTML = '<p class="text-muted text-center">Nessun articolo aggiunto</p>';
        totaleEl.textContent = formatCurrency(0);
        return;
    }

    let html = '<table class="table table-sm"><thead><tr><th>Descrizione</th><th>IVA</th><th>Importo</th><th></th></tr></thead><tbody>';
    let totale = 0;

    appState.articoliCorrente.forEach(art => {
        totale += art.importoLordo;
        html += `
            <tr>
                <td>${art.descrizione}</td>
                <td>${art.aliquotaIva}%</td>
                <td>${formatCurrency(art.importoLordo)}</td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="rimuoviArticolo('${art.id}')"><i class="bi bi-trash"></i></button></td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    lista.innerHTML = html;
    totaleEl.textContent = formatCurrency(totale);
}

async function emettiScontrino() {
    if (appState.articoliCorrente.length === 0) {
        showToast('Attenzione', 'Aggiungi almeno un articolo', 'warning');
        return;
    }

    if (!appState.token) {
        showToast('Errore', 'Configura prima il token API', 'danger');
        return;
    }

    const metodoPagamento = document.getElementById('metodo-pagamento').value;
    const totale = appState.articoliCorrente.reduce((sum, a) => sum + a.importoLordo, 0);

    // Prepara dati per API
    const receiptData = {
        fiscal_id: appState.configurazione.codiceFiscale || appState.configurazione.partitaIva?.replace('IT', ''),
        date: new Date().toISOString(),
        items: appState.articoliCorrente.map(art => ({
            description: art.descrizione,
            quantity: art.quantita,
            unit_price: art.importoLordo,
            vat_rate: art.aliquotaIva,
            amount: art.importoLordo
        })),
        payment_method: metodoPagamento === 'contanti' ? 'cash' : 'card',
        total_amount: totale
    };

    showToast('Invio in corso', 'Emissione scontrino...', 'info');

    try {
        const response = await apiCall(API_CONFIG.endpoints.receipts, 'POST', receiptData);
        const result = await response.json();

        if (response.ok) {
            // Salva localmente
            const nuovoScontrino = {
                id: result.id || generateId(),
                numero: generateNumeroScontrino(),
                dataOra: new Date().toISOString(),
                articoli: [...appState.articoliCorrente],
                metodoPagamento: metodoPagamento,
                totale: totale,
                stato: 'inviato',
                risposta: result
            };

            appState.scontrini.push(nuovoScontrino);
            localStorage.setItem('scontrini', JSON.stringify(appState.scontrini));

            showToast('Successo', 'Scontrino emesso correttamente', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modal-nuovo-scontrino')).hide();
            aggiornaStatistiche();

        } else {
            showToast('Errore', result.message || result.error || 'Errore durante l\'emissione', 'danger');
        }

    } catch (error) {
        console.error('Errore emissione:', error);
        showToast('Errore', 'Errore di connessione', 'danger');
    }
}

// ==========================================
// SINCRONIZZAZIONE DA API
// ==========================================

async function sincronizzaDaAPI(showMessages = true) {
    if (!appState.token) {
        if (showMessages) showToast('Attenzione', 'Configura prima il token API', 'warning');
        return;
    }

    if (showMessages) showToast('Sincronizzazione', 'Scaricamento dati in corso...', 'info');

    try {
        const response = await apiCall(API_CONFIG.endpoints.receipts, 'GET');
        const result = await response.json();

        if (response.ok) {
            const receipts = result.data || result || [];
            
            if (Array.isArray(receipts)) {
                // Converti e unisci con dati locali
                receipts.forEach(receipt => {
                    const exists = appState.scontrini.find(s => s.id === receipt.id);
                    if (!exists) {
                        appState.scontrini.push(convertFromAPI(receipt));
                    }
                });

                localStorage.setItem('scontrini', JSON.stringify(appState.scontrini));
                aggiornaStatistiche();
                
                if (showMessages) showToast('Successo', `Sincronizzati ${receipts.length} scontrini`, 'success');
            }
        } else {
            if (showMessages) showToast('Errore', result.message || 'Errore sincronizzazione', 'danger');
        }

    } catch (error) {
        console.error('Errore sincronizzazione:', error);
        if (showMessages) showToast('Errore', 'Errore di connessione', 'danger');
    }
}

function convertFromAPI(receipt) {
    return {
        id: receipt.id,
        numero: receipt.number || receipt.id,
        dataOra: receipt.date || receipt.created_at,
        articoli: (receipt.items || []).map(item => ({
            descrizione: item.description,
            quantita: item.quantity || 1,
            aliquotaIva: item.vat_rate || 22,
            importoNetto: (item.amount || item.unit_price || 0) / (1 + (item.vat_rate || 22) / 100),
            importoIva: (item.amount || item.unit_price || 0) - ((item.amount || item.unit_price || 0) / (1 + (item.vat_rate || 22) / 100)),
            importoLordo: item.amount || item.unit_price || 0
        })),
        metodoPagamento: receipt.payment_method === 'cash' ? 'contanti' : 'carta',
        totale: receipt.total_amount || receipt.total || 0,
        stato: receipt.status === 'error' ? 'errore' : 'inviato',
        risposta: receipt
    };
}

// ==========================================
// REGISTRO CORRISPETTIVI
// ==========================================

function caricaRegistro() {
    const dataInizio = document.getElementById('filtro-data-inizio')?.value;
    const dataFine = document.getElementById('filtro-data-fine')?.value;
    
    let scontriniFiltrati = appState.scontrini;

    if (dataInizio) {
        const start = new Date(dataInizio);
        start.setHours(0, 0, 0, 0);
        scontriniFiltrati = scontriniFiltrati.filter(s => new Date(s.dataOra) >= start);
    }

    if (dataFine) {
        const end = new Date(dataFine);
        end.setHours(23, 59, 59, 999);
        scontriniFiltrati = scontriniFiltrati.filter(s => new Date(s.dataOra) <= end);
    }

    // Ordina per data decrescente
    scontriniFiltrati.sort((a, b) => new Date(b.dataOra) - new Date(a.dataOra));

    renderRegistro(scontriniFiltrati);
}

function renderRegistro(scontrini) {
    const tbody = document.getElementById('registro-tbody');
    
    if (scontrini.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nessuno scontrino trovato</td></tr>';
        return;
    }

    let html = '';
    scontrini.forEach(s => {
        const statoClass = s.stato === 'inviato' ? 'success' : (s.stato === 'annullato' ? 'secondary' : 'warning');
        html += `
            <tr>
                <td>${s.numero}</td>
                <td>${formatDateTime(s.dataOra)}</td>
                <td>${s.articoli.length} articoli</td>
                <td>${capitalizeFirst(s.metodoPagamento)}</td>
                <td><strong>${formatCurrency(s.totale)}</strong></td>
                <td><span class="badge bg-${statoClass}">${capitalizeFirst(s.stato)}</span></td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function esportaExcel() {
    const dataInizio = document.getElementById('filtro-data-inizio')?.value || '';
    const dataFine = document.getElementById('filtro-data-fine')?.value || '';
    
    let scontriniFiltrati = appState.scontrini;

    if (dataInizio) {
        const start = new Date(dataInizio);
        start.setHours(0, 0, 0, 0);
        scontriniFiltrati = scontriniFiltrati.filter(s => new Date(s.dataOra) >= start);
    }

    if (dataFine) {
        const end = new Date(dataFine);
        end.setHours(23, 59, 59, 999);
        scontriniFiltrati = scontriniFiltrati.filter(s => new Date(s.dataOra) <= end);
    }

    // Crea CSV
    let csv = 'Numero;Data;Descrizione;Imponibile;IVA;Totale;Pagamento;Stato\n';
    
    scontriniFiltrati.forEach(s => {
        s.articoli.forEach(a => {
            csv += `${s.numero};${formatDateTime(s.dataOra)};${a.descrizione};${a.importoNetto.toFixed(2)};${a.importoIva.toFixed(2)};${a.importoLordo.toFixed(2)};${s.metodoPagamento};${s.stato}\n`;
        });
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `registro_corrispettivi_${dataInizio}_${dataFine}.csv`;
    link.click();

    showToast('Esportato', 'File CSV scaricato', 'success');
}

// ==========================================
// RESI E ANNULLAMENTI
// ==========================================

function cercaScontrino() {
    const numero = document.getElementById('cerca-scontrino').value.trim();
    if (!numero) {
        showToast('Attenzione', 'Inserisci il numero scontrino', 'warning');
        return;
    }

    const scontrino = appState.scontrini.find(s => s.numero === numero || s.id === numero);
    
    if (!scontrino) {
        showToast('Non trovato', 'Scontrino non trovato', 'warning');
        return;
    }

    appState.scontrinoSelezionato = scontrino;
    mostraDettaglioReso(scontrino);
}

function mostraDettaglioReso(scontrino) {
    const container = document.getElementById('dettaglio-reso');
    
    let articoliHtml = scontrino.articoli.map(a => `
        <div class="form-check">
            <input class="form-check-input" type="checkbox" value="${a.id}" id="reso-${a.id}">
            <label class="form-check-label" for="reso-${a.id}">
                ${a.descrizione} - ${formatCurrency(a.importoLordo)}
            </label>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="card-section mt-3">
            <h6>Scontrino ${scontrino.numero}</h6>
            <p>Data: ${formatDateTime(scontrino.dataOra)}</p>
            <p>Totale: <strong>${formatCurrency(scontrino.totale)}</strong></p>
            <hr>
            <p><strong>Seleziona articoli da rendere:</strong></p>
            ${articoliHtml}
            <div class="mt-3">
                <button class="btn btn-warning me-2" onclick="effettuaReso()">
                    <i class="bi bi-arrow-return-left"></i> Reso Selezionati
                </button>
                <button class="btn btn-danger" onclick="annullaScontrino()">
                    <i class="bi bi-x-circle"></i> Annulla Intero Scontrino
                </button>
            </div>
        </div>
    `;
    container.classList.remove('hidden');
}

async function effettuaReso() {
    if (!appState.scontrinoSelezionato) return;

    const checkboxes = document.querySelectorAll('#dettaglio-reso input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
        showToast('Attenzione', 'Seleziona almeno un articolo', 'warning');
        return;
    }

    const articoliIds = Array.from(checkboxes).map(cb => cb.value);
    
    showToast('Elaborazione', 'Reso in corso...', 'info');

    try {
        const response = await apiCall(
            `${API_CONFIG.endpoints.receipts}/${appState.scontrinoSelezionato.id}`,
            'PATCH',
            { refund_items: articoliIds }
        );

        const result = await response.json();

        if (response.ok) {
            showToast('Successo', 'Reso effettuato', 'success');
            document.getElementById('dettaglio-reso').classList.add('hidden');
        } else {
            showToast('Errore', result.message || 'Errore durante il reso', 'danger');
        }
    } catch (error) {
        showToast('Errore', 'Errore di connessione', 'danger');
    }
}

async function annullaScontrino() {
    if (!appState.scontrinoSelezionato) return;
    
    if (!confirm('Sei sicuro di voler annullare l\'intero scontrino?')) return;

    showToast('Elaborazione', 'Annullamento in corso...', 'info');

    try {
        const response = await apiCall(
            `${API_CONFIG.endpoints.receipts}/${appState.scontrinoSelezionato.id}`,
            'DELETE'
        );

        const result = await response.json();

        if (response.ok) {
            // Aggiorna stato locale
            const idx = appState.scontrini.findIndex(s => s.id === appState.scontrinoSelezionato.id);
            if (idx !== -1) {
                appState.scontrini[idx].stato = 'annullato';
                localStorage.setItem('scontrini', JSON.stringify(appState.scontrini));
            }

            showToast('Successo', 'Scontrino annullato', 'success');
            document.getElementById('dettaglio-reso').classList.add('hidden');
            aggiornaStatistiche();
        } else {
            showToast('Errore', result.message || 'Errore durante l\'annullamento', 'danger');
        }
    } catch (error) {
        showToast('Errore', 'Errore di connessione', 'danger');
    }
}

// ==========================================
// CONFIGURAZIONE
// ==========================================

function caricaConfigurazione() {
    if (appState.token) {
        document.getElementById('api-token').value = appState.token;
    }
    document.getElementById('api-ambiente').value = appState.ambiente;

    if (appState.configurazione.partitaIva) {
        document.getElementById('partita-iva').value = appState.configurazione.partitaIva;
    }
    if (appState.configurazione.codiceFiscale) {
        document.getElementById('codice-fiscale').value = appState.configurazione.codiceFiscale;
    }
    if (appState.configurazione.ragioneSociale) {
        document.getElementById('ragione-sociale').value = appState.configurazione.ragioneSociale;
    }
    if (appState.configurazione.indirizzo) {
        document.getElementById('indirizzo').value = appState.configurazione.indirizzo;
    }
}

function salvaConfigurazione() {
    appState.token = document.getElementById('api-token').value.trim();
    appState.ambiente = document.getElementById('api-ambiente').value;
    appState.configurazione = {
        partitaIva: document.getElementById('partita-iva').value.trim(),
        codiceFiscale: document.getElementById('codice-fiscale').value.trim(),
        ragioneSociale: document.getElementById('ragione-sociale').value.trim(),
        indirizzo: document.getElementById('indirizzo').value.trim()
    };

    localStorage.setItem('api_token', appState.token);
    localStorage.setItem('api_ambiente', appState.ambiente);
    localStorage.setItem('configurazione', JSON.stringify(appState.configurazione));

    showToast('Salvato', 'Configurazione salvata con successo', 'success');
    checkConfigurazione();
}

async function testConnessione() {
    const token = document.getElementById('api-token').value.trim();
    const ambiente = document.getElementById('api-ambiente').value;

    if (!token) {
        showToast('Attenzione', 'Inserisci il token API', 'warning');
        return;
    }

    // Salva temporaneamente per la chiamata
    appState.token = token;
    appState.ambiente = ambiente;

    showToast('Test in corso', 'Verifica connessione...', 'info');

    try {
        const response = await apiCall(API_CONFIG.endpoints.configurations, 'GET');
        const result = await response.json();

        console.log('Test response:', response.status, result);

        if (response.ok) {
            showToast('Successo', 'Connessione verificata!', 'success');
        } else {
            showToast('Errore', result.message || result.error || 'Token non valido', 'danger');
        }
    } catch (error) {
        console.error('Test connection error:', error);
        showToast('Errore', 'Impossibile connettersi al server', 'danger');
    }
}

function checkConfigurazione() {
    const isConfigured = appState.token && 
                         (appState.configurazione.partitaIva || appState.configurazione.codiceFiscale);
    
    const alert = document.getElementById('config-alert');
    if (alert) {
        if (isConfigured) {
            alert.classList.add('hidden');
        } else {
            alert.classList.remove('hidden');
        }
    }
}

// ==========================================
// UTILITY
// ==========================================

function formatCurrency(amount) {
    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR'
    }).format(amount);
}

function formatDateTime(isoString) {
    return new Date(isoString).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateNumeroScontrino() {
    const oggi = new Date();
    const anno = oggi.getFullYear();
    const count = appState.scontrini.filter(s => {
        return new Date(s.dataOra).getFullYear() === anno;
    }).length + 1;
    return count.toString().padStart(4, '0') + '-' + anno;
}

function showToast(title, message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    const toastTitle = document.getElementById('toast-title');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    toastTitle.textContent = title;
    toastMessage.textContent = message;

    // Icone per tipo
    const icons = {
        success: 'bi-check-circle text-success',
        danger: 'bi-x-circle text-danger',
        warning: 'bi-exclamation-triangle text-warning',
        info: 'bi-info-circle text-info'
    };

    toastIcon.className = 'bi me-2 ' + (icons[type] || icons.info);

    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Service Worker per PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('Service Worker non registrato:', err);
    });
}
