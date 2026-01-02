// ==========================================
// REGISTRO CORRISPETTIVI - APP JAVASCRIPT
// ==========================================

// ==========================================
// AUTENTICAZIONE
// ==========================================

const APP_PASSWORD_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'; // Hash di Matteo2002!
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minuti in millisecondi

let inactivityTimer;

// Funzione per creare hash SHA-256 della password
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verifica login all'avvio
function checkAuth() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const loginTime = sessionStorage.getItem('loginTime');
    
    if (isLoggedIn === 'true' && loginTime) {
        const elapsed = Date.now() - parseInt(loginTime);
        if (elapsed < SESSION_TIMEOUT) {
            showMainApp();
            resetInactivityTimer();
            return;
        }
    }
    
    showLoginScreen();
}

// Gestione login
async function handleLogin(event) {
    event.preventDefault();
    
    const password = document.getElementById('login-password').value;
    const hashedInput = await hashPassword(password);
    
    if (hashedInput === APP_PASSWORD_HASH) {
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('loginTime', Date.now().toString());
        showMainApp();
        resetInactivityTimer();
    } else {
        document.getElementById('login-error').classList.remove('d-none');
        document.getElementById('login-password').value = '';
    }
    
    return false;
}

// Logout
function logout() {
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('loginTime');
    clearTimeout(inactivityTimer);
    showLoginScreen();
}

// Mostra schermata login
function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('d-none');
    document.getElementById('main-app').classList.add('d-none');
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').classList.add('d-none');
}

// Mostra app principale
function showMainApp() {
    document.getElementById('login-screen').classList.add('d-none');
    document.getElementById('main-app').classList.remove('d-none');
}

// Toggle visibilità password
function togglePassword() {
    const input = document.getElementById('login-password');
    const icon = document.getElementById('toggle-icon');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('bi-eye');
        icon.classList.add('bi-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('bi-eye-slash');
        icon.classList.add('bi-eye');
    }
}

// Reset timer inattività
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        alert('Sessione scaduta per inattività');
        logout();
    }, SESSION_TIMEOUT);
}

// Eventi per rilevare attività utente
['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
    document.addEventListener(event, () => {
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            resetInactivityTimer();
        }
    });
});

// Configurazione API
const API_CONFIG = {
    baseUrl: 'https://api.openapi.it',
    sandboxUrl: 'https://sandbox.openapi.it',
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
    scontrinoSelezionato: null
};

// ==========================================
// INIZIALIZZAZIONE
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    // Verifica autenticazione
    checkAuth();
    
    // Imposta data corrente
    const oggi = new Date();
    document.getElementById('current-date').textContent = oggi.toLocaleDateString('it-IT', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Imposta date filtri
    document.getElementById('filtro-data-inizio').valueAsDate = oggi;
    document.getElementById('filtro-data-fine').valueAsDate = oggi;

    // Carica configurazione salvata
    caricaConfigurazione();

    // Gestione navigazione sidebar
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.dataset.section;
            showSection(section);
        });
    });

    // Aggiorna statistiche
    aggiornaStatistiche();

    // Aggiungi primo articolo vuoto
    aggiungiArticolo();

    // Controlla se configurato
    checkConfigurazione();
});

// ==========================================
// NAVIGAZIONE
// ==========================================

function showSection(sectionName) {
    // Nascondi tutte le sezioni
    document.querySelectorAll('main > section').forEach(section => {
        section.classList.add('hidden');
    });

    // Mostra la sezione richiesta
    const targetSection = document.getElementById('section-' + sectionName);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }

    // Aggiorna menu attivo
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.section === sectionName) {
            link.classList.add('active');
        }
    });

    // Aggiorna titolo pagina
    const titoli = {
        'dashboard': 'Dashboard',
        'nuovo-scontrino': 'Nuovo Scontrino',
        'registro': 'Registro Corrispettivi',
        'resi': 'Resi e Annullamenti',
        'configurazione': 'Configurazione'
    };
    document.getElementById('page-title').textContent = titoli[sectionName] || 'Dashboard';
}

// ==========================================
// GESTIONE ARTICOLI
// ==========================================

let articoloCounter = 0;

function aggiungiArticolo() {
    articoloCounter++;
    const container = document.getElementById('lista-articoli');
    
    const articoloHTML = `
        <div class="product-row" id="articolo-${articoloCounter}">
            <div class="row align-items-end">
                <div class="col-md-4 mb-2">
                    <label class="form-label small">Descrizione</label>
                    <input type="text" class="form-control" placeholder="Nome prodotto/servizio" 
                           onchange="calcolaTotale()" data-field="descrizione">
                </div>
                <div class="col-md-2 mb-2">
                    <label class="form-label small">Quantità</label>
                    <input type="number" class="form-control" value="1" min="1" 
                           onchange="calcolaTotale()" data-field="quantita">
                </div>
                <div class="col-md-2 mb-2">
                    <label class="form-label small">Prezzo €</label>
                    <input type="number" class="form-control" step="0.01" placeholder="0.00"
                           onchange="calcolaTotale()" data-field="prezzo">
                </div>
                <div class="col-md-2 mb-2">
                    <label class="form-label small">IVA %</label>
                    <select class="form-select" onchange="calcolaTotale()" data-field="iva">
                        <option value="22">22%</option>
                        <option value="10">10%</option>
                        <option value="4">4%</option>
                        <option value="0">Esente</option>
                    </select>
                </div>
                <div class="col-md-2 mb-2">
                    <button class="btn btn-outline-danger w-100" onclick="rimuoviArticolo(${articoloCounter})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', articoloHTML);
}

function rimuoviArticolo(id) {
    const elemento = document.getElementById('articolo-' + id);
    if (elemento) {
        elemento.remove();
        calcolaTotale();
    }
}

function calcolaTotale() {
    let subtotale = 0;
    let totaleIva = 0;
    const articoli = [];
    
    document.querySelectorAll('.product-row').forEach(row => {
        const descrizione = row.querySelector('[data-field="descrizione"]').value;
        const quantita = parseFloat(row.querySelector('[data-field="quantita"]').value) || 0;
        const prezzo = parseFloat(row.querySelector('[data-field="prezzo"]').value) || 0;
        const iva = parseFloat(row.querySelector('[data-field="iva"]').value) || 0;
        
        const importo = quantita * prezzo;
        const importoIva = importo * (iva / 100);
        
        subtotale += importo;
        totaleIva += importoIva;
        
        if (descrizione && prezzo > 0) {
            articoli.push({
                descrizione,
                quantita,
                prezzo,
                iva,
                importo,
                importoIva
            });
        }
    });
    
    appState.articoliCorrente = articoli;
    
    document.getElementById('subtotale').textContent = formatCurrency(subtotale);
    document.getElementById('totale-iva').textContent = formatCurrency(totaleIva);
    document.getElementById('totale').textContent = formatCurrency(subtotale + totaleIva);
}

// ==========================================
// EMISSIONE SCONTRINO
// ==========================================

async function emettiScontrino() {
    // Verifica configurazione
    if (!appState.token) {
        showToast('Errore', 'Configura prima il token API nelle impostazioni', 'danger');
        showSection('configurazione');
        return;
    }

    // Verifica articoli
    calcolaTotale();
    if (appState.articoliCorrente.length === 0) {
        showToast('Attenzione', 'Aggiungi almeno un articolo', 'warning');
        return;
    }

    // Prepara dati scontrino
    const metodoPagamento = document.getElementById('metodo-pagamento').value;
    const totale = appState.articoliCorrente.reduce((sum, art) => sum + art.importo + art.importoIva, 0);
    
    const scontrino = {
        id: generateId(),
        numero: generateNumeroScontrino(),
        dataOra: new Date().toISOString(),
        articoli: [...appState.articoliCorrente],
        metodoPagamento: metodoPagamento,
        totale: totale,
        stato: 'pending',
        risposta: null
    };

    // Mostra loading
    showToast('Invio in corso', 'Attendere...', 'info');

    try {
        // Prepara payload per API OpenAPI
        const payload = preparaPayloadAPI(scontrino);
        
        // Invia a OpenAPI
        const response = await inviaAllaAPI(payload);
        
        if (response.success) {
            scontrino.stato = 'inviato';
            scontrino.risposta = response.data;
            showToast('Successo', 'Scontrino inviato correttamente!', 'success');
        } else {
            scontrino.stato = 'errore';
            scontrino.risposta = response.error;
            showToast('Errore', response.error || 'Errore durante l\'invio', 'danger');
        }
    } catch (error) {
        scontrino.stato = 'errore';
        scontrino.risposta = error.message;
        showToast('Errore', 'Errore di connessione: ' + error.message, 'danger');
    }

    // Salva scontrino
    appState.scontrini.unshift(scontrino);
    localStorage.setItem('scontrini', JSON.stringify(appState.scontrini));

    // Aggiorna UI
    aggiornaStatistiche();
    aggiornaTabellaScontrini();

    // Reset form
    resetFormScontrino();
    
    // Torna alla dashboard
    showSection('dashboard');
}

function preparaPayloadAPI(scontrino) {
    // Formato richiesto da OpenAPI per IT-receipts
    const items = scontrino.articoli.map(art => ({
        description: art.descrizione,
        quantity: art.quantita,
        unit_price: art.prezzo,
        vat_rate: art.iva,
        amount: art.importo + art.importoIva
    }));

    // Mappa metodo pagamento
    const paymentMap = {
        'contanti': 'cash',
        'carta': 'card',
        'bancomat': 'card',
        'altro': 'other'
    };

    return {
        fiscal_id: appState.configurazione.codiceFiscale || appState.configurazione.partitaIva,
        items: items,
        payment_method: paymentMap[scontrino.metodoPagamento] || 'cash',
        total_amount: scontrino.totale,
        document_type: 'receipt',
        date: new Date().toISOString().split('T')[0]
    };
}

async function inviaAllaAPI(payload) {
    const baseUrl = appState.ambiente === 'production' ? API_CONFIG.baseUrl : API_CONFIG.sandboxUrl;
    const url = baseUrl + API_CONFIG.endpoints.receipts;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + appState.token
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            return { success: true, data: data };
        } else {
            return { success: false, error: data.message || 'Errore API' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function annullaScontrino() {
    if (confirm('Vuoi annullare questo scontrino?')) {
        resetFormScontrino();
        showSection('dashboard');
    }
}

function resetFormScontrino() {
    document.getElementById('lista-articoli').innerHTML = '';
    document.getElementById('metodo-pagamento').value = 'contanti';
    appState.articoliCorrente = [];
    articoloCounter = 0;
    aggiungiArticolo();
    calcolaTotale();
}

// ==========================================
// STATISTICHE E DASHBOARD
// ==========================================

function aggiornaStatistiche() {
    const oggi = new Date().toDateString();
    const inizioMese = new Date();
    inizioMese.setDate(1);
    inizioMese.setHours(0, 0, 0, 0);

    let incassoOggi = 0;
    let scontriniOggi = 0;
    let incassoMese = 0;
    let pending = 0;
    let iva22 = 0, iva10 = 0, iva4 = 0, iva0 = 0;

    appState.scontrini.forEach(scontrino => {
        const dataScontrino = new Date(scontrino.dataOra);
        
        // Statistiche oggi
        if (dataScontrino.toDateString() === oggi && scontrino.stato === 'inviato') {
            incassoOggi += scontrino.totale;
            scontriniOggi++;
            
            // Riepilogo IVA
            scontrino.articoli.forEach(art => {
                switch (art.iva) {
                    case 22: iva22 += art.importoIva; break;
                    case 10: iva10 += art.importoIva; break;
                    case 4: iva4 += art.importoIva; break;
                    case 0: iva0 += art.importo; break;
                }
            });
        }

        // Statistiche mese
        if (dataScontrino >= inizioMese && scontrino.stato === 'inviato') {
            incassoMese += scontrino.totale;
        }

        // Pending
        if (scontrino.stato === 'pending') {
            pending++;
        }
    });

    document.getElementById('stat-oggi').textContent = formatCurrency(incassoOggi);
    document.getElementById('stat-scontrini').textContent = scontriniOggi;
    document.getElementById('stat-mese').textContent = formatCurrency(incassoMese);
    document.getElementById('stat-pending').textContent = pending;

    document.getElementById('iva-22').textContent = formatCurrency(iva22);
    document.getElementById('iva-10').textContent = formatCurrency(iva10);
    document.getElementById('iva-4').textContent = formatCurrency(iva4);
    document.getElementById('iva-0').textContent = formatCurrency(iva0);

    // Aggiorna tabella ultimi scontrini
    aggiornaTabellaScontrini();
}

function aggiornaTabellaScontrini() {
    const tbody = document.querySelector('#table-ultimi-scontrini tbody');
    const ultimi = appState.scontrini.slice(0, 10);

    if (ultimi.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-4">
                    Nessuno scontrino emesso
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = ultimi.map(s => `
        <tr>
            <td>${formatDateTime(s.dataOra)}</td>
            <td><code>${s.numero}</code></td>
            <td><strong>${formatCurrency(s.totale)}</strong></td>
            <td><span class="badge-status badge-${s.stato}">${capitalizeFirst(s.stato)}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="visualizzaScontrino('${s.id}')">
                    <i class="bi bi-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ==========================================
// REGISTRO CORRISPETTIVI
// ==========================================

function filtraRegistro() {
    const dataInizio = document.getElementById('filtro-data-inizio').value;
    const dataFine = document.getElementById('filtro-data-fine').value;
    const stato = document.getElementById('filtro-stato').value;

    let scontriniFiltrati = appState.scontrini.filter(s => {
        const dataScontrino = new Date(s.dataOra).toISOString().split('T')[0];
        
        if (dataInizio && dataScontrino < dataInizio) return false;
        if (dataFine && dataScontrino > dataFine) return false;
        if (stato && s.stato !== stato) return false;
        
        return true;
    });

    renderRegistro(scontriniFiltrati);
}

function renderRegistro(scontrini) {
    const tbody = document.querySelector('#table-registro tbody');

    if (scontrini.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    Nessuno scontrino trovato
                </td>
            </tr>
        `;
        return;
    }

    const metodiPagamento = {
        'contanti': 'Contanti',
        'carta': 'Carta',
        'bancomat': 'Bancomat',
        'altro': 'Altro'
    };

    tbody.innerHTML = scontrini.map(s => `
        <tr>
            <td>${formatDateTime(s.dataOra)}</td>
            <td><code>${s.numero}</code></td>
            <td><strong>${formatCurrency(s.totale)}</strong></td>
            <td>${metodiPagamento[s.metodoPagamento] || s.metodoPagamento}</td>
            <td><span class="badge-status badge-${s.stato}">${capitalizeFirst(s.stato)}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="visualizzaScontrino('${s.id}')">
                    <i class="bi bi-eye"></i>
                </button>
                ${s.stato === 'inviato' ? `
                    <button class="btn btn-sm btn-outline-danger" onclick="avviaReso('${s.id}')">
                        <i class="bi bi-arrow-return-left"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function esportaRegistro() {
    // Esporta in CSV (Excel compatibile)
    const dataInizio = document.getElementById('filtro-data-inizio').value;
    const dataFine = document.getElementById('filtro-data-fine').value;
    
    let scontriniFiltrati = appState.scontrini.filter(s => {
        const dataScontrino = new Date(s.dataOra).toISOString().split('T')[0];
        if (dataInizio && dataScontrino < dataInizio) return false;
        if (dataFine && dataScontrino > dataFine) return false;
        return true;
    });

    let csv = 'Data;Numero;Importo;IVA;Totale;Pagamento;Stato\n';
    
    scontriniFiltrati.forEach(s => {
        const imponibile = s.articoli.reduce((sum, a) => sum + a.importo, 0);
        const iva = s.articoli.reduce((sum, a) => sum + a.importoIva, 0);
        csv += `${formatDateTime(s.dataOra)};${s.numero};${imponibile.toFixed(2)};${iva.toFixed(2)};${s.totale.toFixed(2)};${s.metodoPagamento};${s.stato}\n`;
    });

    downloadFile(csv, `registro_corrispettivi_${dataInizio}_${dataFine}.csv`, 'text/csv');
    showToast('Esportazione', 'File CSV scaricato', 'success');
}

function esportaPDF() {
    showToast('Info', 'Funzionalità PDF in sviluppo', 'info');
}

// ==========================================
// VISUALIZZAZIONE DETTAGLIO
// ==========================================

function visualizzaScontrino(id) {
    const scontrino = appState.scontrini.find(s => s.id === id);
    if (!scontrino) return;

    appState.scontrinoSelezionato = scontrino;

    const content = document.getElementById('modal-dettaglio-content');
    content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <p><strong>Numero:</strong> ${scontrino.numero}</p>
                <p><strong>Data/Ora:</strong> ${formatDateTime(scontrino.dataOra)}</p>
                <p><strong>Stato:</strong> <span class="badge-status badge-${scontrino.stato}">${capitalizeFirst(scontrino.stato)}</span></p>
                <p><strong>Metodo Pagamento:</strong> ${capitalizeFirst(scontrino.metodoPagamento)}</p>
            </div>
            <div class="col-md-6">
                <p><strong>Totale:</strong> <span class="fs-4 text-primary">${formatCurrency(scontrino.totale)}</span></p>
            </div>
        </div>
        <hr>
        <h6>Articoli</h6>
        <table class="table table-sm">
            <thead>
                <tr>
                    <th>Descrizione</th>
                    <th>Qta</th>
                    <th>Prezzo</th>
                    <th>IVA</th>
                    <th>Totale</th>
                </tr>
            </thead>
            <tbody>
                ${scontrino.articoli.map(a => `
                    <tr>
                        <td>${a.descrizione}</td>
                        <td>${a.quantita}</td>
                        <td>${formatCurrency(a.prezzo)}</td>
                        <td>${a.iva}%</td>
                        <td>${formatCurrency(a.importo + a.importoIva)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${scontrino.risposta ? `
            <hr>
            <h6>Risposta API</h6>
            <pre class="bg-light p-2 small">${JSON.stringify(scontrino.risposta, null, 2)}</pre>
        ` : ''}
    `;

    const modal = new bootstrap.Modal(document.getElementById('modalDettaglio'));
    modal.show();
}

function annullaScontrinoSelezionato() {
    if (!appState.scontrinoSelezionato) return;
    
    if (confirm('Sei sicuro di voler annullare questo scontrino? Verrà inviata una nota di credito.')) {
        avviaReso(appState.scontrinoSelezionato.id);
        bootstrap.Modal.getInstance(document.getElementById('modalDettaglio')).hide();
    }
}

// ==========================================
// RESI
// ==========================================

function cercaScontrino() {
    const numero = document.getElementById('scontrino-reso').value.trim();
    const scontrino = appState.scontrini.find(s => s.numero === numero);
    
    if (!scontrino) {
        showToast('Non trovato', 'Scontrino non trovato', 'warning');
        document.getElementById('dettaglio-reso').classList.add('hidden');
        return;
    }

    renderDettaglioReso(scontrino);
}

function avviaReso(id) {
    const scontrino = appState.scontrini.find(s => s.id === id);
    if (!scontrino) return;

    showSection('resi');
    document.getElementById('scontrino-reso').value = scontrino.numero;
    renderDettaglioReso(scontrino);
}

function renderDettaglioReso(scontrino) {
    const container = document.getElementById('dettaglio-reso');
    container.classList.remove('hidden');
    
    container.innerHTML = `
        <div class="card-section mt-4">
            <h6><i class="bi bi-receipt me-2"></i>Scontrino: ${scontrino.numero}</h6>
            <p class="text-muted">Data: ${formatDateTime(scontrino.dataOra)} - Totale: ${formatCurrency(scontrino.totale)}</p>
            
            <h6 class="mt-4">Seleziona articoli da rendere:</h6>
            <form id="form-reso">
                ${scontrino.articoli.map((a, i) => `
                    <div class="form-check mb-2 p-3 bg-light rounded">
                        <input class="form-check-input" type="checkbox" id="reso-${i}" data-index="${i}">
                        <label class="form-check-label d-flex justify-content-between w-100" for="reso-${i}">
                            <span>${a.descrizione} (x${a.quantita})</span>
                            <strong>${formatCurrency(a.importo + a.importoIva)}</strong>
                        </label>
                    </div>
                `).join('')}
            </form>
            
            <div class="mt-4">
                <button class="btn btn-danger" onclick="eseguiReso('${scontrino.id}')">
                    <i class="bi bi-arrow-return-left me-2"></i>Esegui Reso
                </button>
            </div>
        </div>
    `;
}

async function eseguiReso(scontrinoId) {
    const scontrino = appState.scontrini.find(s => s.id === scontrinoId);
    if (!scontrino) return;

    const checkboxes = document.querySelectorAll('#form-reso input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
        showToast('Attenzione', 'Seleziona almeno un articolo', 'warning');
        return;
    }

    const articoliReso = [];
    checkboxes.forEach(cb => {
        const index = parseInt(cb.dataset.index);
        articoliReso.push(scontrino.articoli[index]);
    });

    const totaleReso = articoliReso.reduce((sum, a) => sum + a.importo + a.importoIva, 0);

    if (!confirm(`Confermi il reso di ${formatCurrency(totaleReso)}?`)) return;

    showToast('Invio in corso', 'Attendere...', 'info');

    try {
        // Prepara payload reso per API
        const payload = {
            original_receipt_id: scontrino.id,
            items: articoliReso.map(a => ({
                description: a.descrizione,
                quantity: a.quantita,
                unit_price: a.prezzo,
                vat_rate: a.iva
            })),
            refund_amount: totaleReso
        };

        const baseUrl = appState.ambiente === 'production' ? API_CONFIG.baseUrl : API_CONFIG.sandboxUrl;
        const response = await fetch(`${baseUrl}/IT-receipts/${scontrinoId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + appState.token
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Crea scontrino di reso locale
            const scontrinoReso = {
                id: generateId(),
                numero: generateNumeroScontrino() + '-R',
                dataOra: new Date().toISOString(),
                articoli: articoliReso,
                metodoPagamento: scontrino.metodoPagamento,
                totale: -totaleReso,
                stato: 'inviato',
                tipo: 'reso',
                scontrinoOriginale: scontrino.numero
            };

            appState.scontrini.unshift(scontrinoReso);
            localStorage.setItem('scontrini', JSON.stringify(appState.scontrini));

            showToast('Successo', 'Reso completato', 'success');
            aggiornaStatistiche();
            showSection('dashboard');
        } else {
            const error = await response.json();
            showToast('Errore', error.message || 'Errore durante il reso', 'danger');
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

    showToast('Test in corso', 'Verifica connessione...', 'info');

    try {
        const baseUrl = ambiente === 'production' ? API_CONFIG.baseUrl : API_CONFIG.sandboxUrl;
        const response = await fetch(`${baseUrl}/IT-configurations`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });

        if (response.ok) {
            showToast('Successo', 'Connessione verificata!', 'success');
        } else {
            const error = await response.json();
            showToast('Errore', error.message || 'Token non valido', 'danger');
        }
    } catch (error) {
        showToast('Errore', 'Impossibile connettersi al server', 'danger');
    }
}

function checkConfigurazione() {
    const isConfigured = appState.token && 
                         (appState.configurazione.partitaIva || appState.configurazione.codiceFiscale);
    
    const alert = document.getElementById('config-alert');
    if (isConfigured) {
        alert.classList.add('hidden');
    } else {
        alert.classList.remove('hidden');
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
        info: 'bi-info-circle text-primary'
    };
    toastIcon.className = 'bi me-2 ' + (icons[type] || icons.info);

    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
