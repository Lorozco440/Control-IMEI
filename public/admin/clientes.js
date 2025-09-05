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

// --- Lógica de la Página de Clientes ---
document.addEventListener('DOMContentLoaded', () => {
    if (!token) {
        window.location.href = '/admin/login.html';
        return;
    }

    const clientesTbody = document.querySelector('#clientes-table tbody');
    let allClientes = [];

    const renderClientes = () => {
        clientesTbody.innerHTML = '';
        if (allClientes.length === 0) {
            clientesTbody.innerHTML = '<tr><td colspan="3">No hay clientes registrados.</td></tr>';
            return;
        }
        allClientes.forEach(cliente => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cliente.codigo_sap}</td>
                <td>${cliente.nombre_negocio}</td>
                <td>
                    <div class="actions-container">
                        <button class="action-btn edit-btn" onclick="editarCliente(${cliente.id}, '${cliente.codigo_sap}', '${cliente.nombre_negocio}')">Editar</button>
                        <button class="action-btn delete-btn" onclick="eliminarCliente(${cliente.id})">Eliminar</button>
                    </div>
                </td>
            `;
            clientesTbody.appendChild(tr);
        });
    };

    const cargarClientes = async () => {
        const res = await fetchWithAuth('/clientes');
        const data = await res.json();
        if (data.ok) {
            allClientes = data.clientes;
            renderClientes();
        }
    };

    window.editarCliente = async (id, sapActual, nombreActual) => {
        const { value: form } = await Swal.fire({
            title: 'Editar Cliente',
            html: `
                <input id="swal-sap" class="swal2-input" placeholder="Código SAP" value="${sapActual}">
                <input id="swal-nombre" class="swal2-input" placeholder="Nombre del Negocio" value="${nombreActual}">
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Guardar Cambios',
            preConfirm: () => [document.getElementById('swal-sap').value, document.getElementById('swal-nombre').value]
        });
        if (form) {
            const [codigo_sap, nombre_negocio] = form;
            if (!codigo_sap || !nombre_negocio) return Swal.fire('Error', 'Ambos campos son requeridos', 'error');
            const res = await fetchWithAuth(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify({ codigo_sap, nombre_negocio }) });
            if (res.ok) {
                Swal.fire('¡Actualizado!', 'El cliente ha sido actualizado.', 'success');
                cargarClientes();
            } else {
                const data = await res.json();
                Swal.fire('Error', data.error || 'No se pudo actualizar.', 'error');
            }
        }
    };

    window.eliminarCliente = async (id) => {
        const { isConfirmed } = await Swal.fire({
            title: '¿Estás seguro?',
            text: "¡No podrás revertir esto!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, ¡bórralo!'
        });

        if (isConfirmed) {
            const res = await fetchWithAuth(`/clientes/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                Swal.fire('¡Eliminado!', 'El cliente ha sido eliminado.', 'success');
                cargarClientes();
            } else {
                Swal.fire('Error', data.error || 'No se pudo eliminar el cliente.', 'error');
            }
        }
    };
    
    // Carga inicial de datos
    cargarClientes();
});
