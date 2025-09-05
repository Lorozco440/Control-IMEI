// --- Lógica Universal ---
const API_BASE_URL = '/api/admin';
const token = localStorage.getItem('adminToken');

const fetchWithAuth = async (url, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('adminToken');
        window.location.href = '/admin/login.html';
    }
    return response;
};

// --- Lógica del Login ---
if (document.getElementById('login-form')) {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorMessage = document.getElementById('error-message');
        errorMessage.textContent = '';
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('adminToken', data.token);
            window.location.href = '/admin/index.html';
        } else {
            errorMessage.textContent = data.error || 'Error al iniciar sesión.';
        }
    });
}

// --- Lógica del Panel Principal ---
if (document.getElementById('bajas-table')) {
    if (!token) window.location.href = '/admin/login.html';

    let state = { allModelos: [], allBajas: [], registros: [], pagination: { currentPage: 1, totalPages: 1 }, filters: { bajaId: '', search: '' } };

    // --- Elementos del DOM ---
    const bajasTbody = document.querySelector('#bajas-table tbody');
    const modelosMaestroTbody = document.querySelector('#modelos-maestro-table tbody');
    const registrosTbody = document.querySelector('#registros-table tbody');
    const filterBajaSelect = document.getElementById('filter-baja');
    const searchInput = document.getElementById('search-input');
    const filterBtn = document.getElementById('filter-btn');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const pageInfo = document.getElementById('page-info');
    const exportBtn = document.getElementById('export-excel-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // --- Funciones de Renderizado ---
    const renderBajas = () => {
        bajasTbody.innerHTML = '';
        state.allBajas.forEach(baja => {
            const tr = document.createElement('tr');
            const modelosAsignadosHTML = baja.modelos.map(m => `<span class="modelo-tag">${m.nombre_modelo} <button class="remove-modelo-btn" onclick="quitarModeloDeBaja(${baja.id}, ${m.id})">x</button></span>`).join('');
            const modelosNoAsignados = state.allModelos.filter(m => !baja.modelos.some(bm => bm.id === m.id));
            const selectOptions = modelosNoAsignados.map(m => `<option value="${m.id}">${m.nombre_modelo}</option>`).join('');
            tr.innerHTML = `<td>${baja.nombre_baja}</td><td>${new Date(baja.fecha_baja).toLocaleDateString()}</td><td><div class="modelos-container">${modelosAsignadosHTML}<select class="add-modelo-select" onchange="agregarModeloABaja(${baja.id}, this.value)"><option value="">Añadir...</option>${selectOptions}</select></div></td><td><span class="status ${baja.esta_activa ? 'activo' : 'inactivo'}">${baja.esta_activa ? 'Activa' : 'Inactiva'}</span></td><td><label class="switch"><input type="checkbox" ${baja.esta_activa ? 'checked' : ''} onchange="toggleBaja(${baja.id})"><span class="slider"></span></label></td><td><div class="actions-container"><button class="action-btn edit-btn" onclick="editarBaja(${baja.id}, '${baja.nombre_baja}', '${baja.fecha_baja.split('T')[0]}')">Editar</button><button class="action-btn delete-btn" onclick="eliminarBaja(${baja.id})">Eliminar</button></div></td>`;
            bajasTbody.appendChild(tr);
        });
        filterBajaSelect.innerHTML = '<option value="">Todas las Campañas</option>' + state.allBajas.map(b => `<option value="${b.id}">${b.nombre_baja}</option>`).join('');
    };
    const renderMaestroModelos = () => {
        modelosMaestroTbody.innerHTML = '';
        state.allModelos.forEach(modelo => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${modelo.nombre_modelo}</td><td><div class="actions-container"><button class="action-btn edit-btn" onclick="editarModelo(${modelo.id}, '${modelo.nombre_modelo}')">Editar</button><button class="action-btn delete-btn" onclick="eliminarModelo(${modelo.id})">Eliminar</button></div></td>`;
            modelosMaestroTbody.appendChild(tr);
        });
    };
    const renderRegistros = () => {
        registrosTbody.innerHTML = '';
        state.registros.forEach(r => {
            const tr = document.createElement('tr');
            const fechaLocal = new Date(r.fecha_registro).toLocaleString();
            tr.innerHTML = `<td>${fechaLocal}</td><td>${r.nombre_baja}</td><td>${r.nombre_negocio}</td><td>${r.codigo_sap}</td><td>${r.nombre_modelo}</td><td>${r.imei}</td>`;
            registrosTbody.appendChild(tr);
        });
        pageInfo.textContent = `Página ${state.pagination.currentPage} de ${state.pagination.totalPages || 1}`;
        prevPageBtn.disabled = state.pagination.currentPage <= 1;
        nextPageBtn.disabled = state.pagination.currentPage >= state.pagination.totalPages;
    };

    // --- Funciones de API ---
    const fetchData = async () => {
        // CORRECCIÓN: Se eliminó la llamada a la API de clientes que causaba el error.
        const [bajasRes, modelosRes] = await Promise.all([
            fetchWithAuth('/bajas'),
            fetchWithAuth('/modelos')
        ]);
        const bajasData = await bajasRes.json();
        const modelosData = await modelosRes.json();
        if (modelosData.ok) state.allModelos = modelosData.modelos;
        if (bajasData.ok) state.allBajas = bajasData.bajas;
        renderBajas();
        renderMaestroModelos();
        fetchRegistros();
    };
    const fetchRegistros = async (page = 1) => {
        state.pagination.currentPage = page;
        const { bajaId, search } = state.filters;
        const params = new URLSearchParams({ page: state.pagination.currentPage, limit: 15 });
        if (bajaId) params.append('bajaId', bajaId);
        if (search) params.append('search', search);
        const res = await fetchWithAuth(`/registros?${params.toString()}`);
        const data = await res.json();
        if (data.ok) {
            state.registros = data.registros;
            state.pagination = data.pagination;
            renderRegistros();
        }
    };

    // --- Funciones de Interacción ---
    window.toggleBaja = async (id) => { await fetchWithAuth(`/bajas/${id}/toggle`, { method: 'PUT' }); fetchData(); };
    window.agregarModeloABaja = async (bajaId, modeloId) => { if (!modeloId) return; await fetchWithAuth(`/bajas/${bajaId}/modelos`, { method: 'POST', body: JSON.stringify({ modelo_id: modeloId }) }); fetchData(); };
    window.quitarModeloDeBaja = async (bajaId, modeloId) => { await fetchWithAuth(`/bajas/${bajaId}/modelos/${modeloId}`, { method: 'DELETE' }); fetchData(); };
    window.editarBaja = async (id, nombre, fecha) => {
        const { value: form } = await Swal.fire({ title: 'Editar Campaña', html: `<input id="swal-n" class="swal2-input" value="${nombre}"><input id="swal-f" type="date" class="swal2-input" value="${fecha}">`, focusConfirm: false, preConfirm: () => [document.getElementById('swal-n').value, document.getElementById('swal-f').value] });
        if (form) {
            const [nombre_baja, fecha_baja] = form;
            if (!nombre_baja || !fecha_baja) return Swal.fire('Error', 'Ambos campos son requeridos', 'error');
            const res = await fetchWithAuth(`/bajas/${id}`, { method: 'PUT', body: JSON.stringify({ nombre_baja, fecha_baja }) });
            if (res.ok) { Swal.fire('¡Actualizado!', '', 'success'); fetchData(); } else { Swal.fire('Error', 'No se pudo actualizar.', 'error'); }
        }
    };
    window.eliminarBaja = async (id) => {
        const { isConfirmed } = await Swal.fire({ title: '¿Estás seguro?', text: "¡No podrás revertir esto!", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, ¡bórrala!' });
        if (isConfirmed) {
            const res = await fetchWithAuth(`/bajas/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) { Swal.fire('¡Eliminada!', '', 'success'); fetchData(); } else { Swal.fire('Error', data.error, 'error'); }
        }
    };
    window.editarModelo = async (id, nombreActual) => {
        const { value: nombre_modelo } = await Swal.fire({ title: 'Editar Modelo', input: 'text', inputValue: nombreActual, showCancelButton: true });
        if (nombre_modelo) {
            const res = await fetchWithAuth(`/modelos/${id}`, { method: 'PUT', body: JSON.stringify({ nombre_modelo }) });
            if (res.ok) { Swal.fire('¡Actualizado!', '', 'success'); fetchData(); } else { Swal.fire('Error', 'No se pudo actualizar.', 'error'); }
        }
    };
    window.eliminarModelo = async (id) => {
        const { isConfirmed } = await Swal.fire({ title: '¿Estás seguro?', text: "¡No podrás revertir esto!", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, ¡bórralo!' });
        if (isConfirmed) {
            const res = await fetchWithAuth(`/modelos/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) { Swal.fire('¡Eliminado!', '', 'success'); fetchData(); } else { Swal.fire('Error', data.error, 'error'); }
        }
    };

    // --- Event Listeners ---
    document.getElementById('add-model-btn').addEventListener('click', async () => {
        const input = document.getElementById('new-model-name');
        const nombre_modelo = input.value.trim();
        if (!nombre_modelo) return;
        const res = await fetchWithAuth('/modelos', { method: 'POST', body: JSON.stringify({ nombre_modelo }) });
        if (res.ok) { Swal.fire('¡Creado!', 'El nuevo modelo ha sido añadido.', 'success'); input.value = ''; fetchData(); }
        else { const data = await res.json(); Swal.fire('Error', data.error, 'error'); }
    });
    document.getElementById('add-baja-btn').addEventListener('click', async () => {
        const nameInput = document.getElementById('new-baja-name');
        const dateInput = document.getElementById('new-baja-date');
        const nombre_baja = nameInput.value.trim();
        const fecha_baja = dateInput.value;
        if (!nombre_baja || !fecha_baja) return;
        const res = await fetchWithAuth('/bajas', { method: 'POST', body: JSON.stringify({ nombre_baja, fecha_baja }) });
        if (res.ok) { Swal.fire('¡Creada!', 'La nueva campaña ha sido añadida.', 'success'); nameInput.value = ''; dateInput.value = ''; fetchData(); }
        else { const data = await res.json(); Swal.fire('Error', data.error, 'error'); }
    });

    // Event listener para el formulario de clientes simplificado
    document.getElementById('add-client-btn').addEventListener('click', async () => {
        const sapInput = document.getElementById('new-client-sap');
        const nameInput = document.getElementById('new-client-name');
        const codigo_sap = sapInput.value.trim();
        const nombre_negocio = nameInput.value.trim();
        if (!codigo_sap || !nombre_negocio) return;

        const res = await fetchWithAuth('/clientes', {
            method: 'POST',
            body: JSON.stringify({ codigo_sap, nombre_negocio })
        });

        if (res.ok) {
            Swal.fire('¡Creado!', 'El nuevo cliente ha sido añadido.', 'success');
            sapInput.value = '';
            nameInput.value = '';
        } else {
            const data = await res.json();
            Swal.fire('Error', data.error, 'error');
        }
    });

    filterBtn.addEventListener('click', () => {
        state.filters.bajaId = filterBajaSelect.value;
        state.filters.search = searchInput.value.trim();
        fetchRegistros(1);
    });

    prevPageBtn.addEventListener('click', () => fetchRegistros(state.pagination.currentPage - 1));
    nextPageBtn.addEventListener('click', () => fetchRegistros(state.pagination.currentPage + 1));
    exportBtn.addEventListener('click', async () => {
        const { bajaId, search } = state.filters;
        const params = new URLSearchParams();
        if (bajaId) params.append('bajaId', bajaId);
        if (search) params.append('search', search);
        const response = await fetchWithAuth(`/registros/export?${params.toString()}`);
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'reporte_imeis.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } else {
            Swal.fire('Error', 'No se pudo generar el archivo Excel.', 'error');
        }
    });
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        window.location.href = '/admin/login.html';
    });

    // --- Carga Inicial ---
    fetchData();
}

