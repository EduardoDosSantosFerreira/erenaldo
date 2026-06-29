// modules/gestao.js
import supabase from '../services/supabase.js';

// ============================================
// TOAST
// ============================================
window.showToast = function(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    if (!toast || !toastMessage) {
        console.log(`[${type}] ${message}`);
        return;
    }

    const icon = toast.querySelector('i');
    toast.className = '';

    const icons = {
        success: 'check-circle',
        error: 'x-circle',
        warning: 'alert-triangle',
        info: 'info'
    };

    if (icon) {
        icon.setAttribute('data-lucide', icons[type] || 'info');
    }

    toast.classList.add(type);
    toastMessage.textContent = message;
    toast.classList.add('show');

    if (window.lucide) lucide.createIcons();

    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
};

// ============================================
// CONFIRM MODAL
// ============================================
function setupConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (!modal) return;

    const closeBtn = document.getElementById('closeConfirmModal');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const actionBtn = document.getElementById('confirmActionBtn');

    const closeModal = () => {
        modal.style.display = 'none';
        window.confirmCallback = null;
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    actionBtn?.addEventListener('click', () => {
        if (window.confirmCallback) {
            window.confirmCallback();
            window.confirmCallback = null;
        }
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

window.showConfirm = function(message, callback) {
    const modal = document.getElementById('confirmModal');
    if (!modal) {
        if (confirm(message)) {
            callback();
        }
        return;
    }

    document.getElementById('confirmMessage').textContent = message;
    window.confirmCallback = callback;
    modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
};

// ============================================
// DROPDOWN
// ============================================
function setupUserDropdown() {
    const avatar = document.getElementById('userAvatar');
    const dropdown = document.getElementById('userDropdown');

    if (!avatar || !dropdown) return;

    avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !avatar.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.classList.remove('active');
        }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try {
            await supabase.auth.signOut();
            localStorage.removeItem('erenaldo_user');
            window.location.href = '/login.html';
        } catch (error) {
            console.error('❌ Erro ao sair:', error);
            window.showToast('Erro ao sair!', 'error');
        }
    });
}

// ============================================
// GESTAO MANAGER - CRUD REAL (tabela "usuarios")
// ============================================
class GestaoManager {
    constructor() {
        this.usuarios = [];
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalPages = 1;
        this.totalUsuarios = 0;
        this.searchTerm = '';
        this.isLoading = false;
        this.user = null;
    }

    async init() {
        console.log('🚀 Inicializando Gestão...');
        setupConfirmModal();
        await this.loadUserInfo();
        await this.loadUsuarios();
        this.setupEvents();
        this.setupDropdown();
    }

    setupDropdown() {
        setupUserDropdown();
    }

    // ============================================
    // LOAD USER INFO (admin logado, exibido no header)
    // ============================================
    async loadUserInfo() {
        try {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error) throw error;

            if (user) {
                const nome = user.user_metadata?.nome || 'Usuário';
                const email = user.email || '';
                const inicial = nome.charAt(0).toUpperCase();

                document.getElementById('userName').textContent = nome;
                document.getElementById('userAvatar').textContent = inicial;
                document.getElementById('dropdownAvatar').textContent = inicial;
                document.getElementById('dropdownName').textContent = nome;
                document.getElementById('dropdownEmail').textContent = email;

                this.user = user;
            }
        } catch (error) {
            console.error('❌ Erro ao carregar usuário:', error);
        }
    }

    // ============================================
    // LOAD - REAL (busca, paginação)
    // ============================================
    async loadUsuarios() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            console.log('📥 Carregando usuários...');

            let query = supabase
                .from('usuarios')
                .select('*', { count: 'exact' });

            if (this.searchTerm && this.searchTerm.trim() !== '') {
                const term = `%${this.searchTerm.trim()}%`;
                query = query.or(`nome.ilike.${term},email.ilike.${term}`);
            }

            query = query.order('nome', { ascending: true });

            const from = (this.currentPage - 1) * this.pageSize;
            const to = from + this.pageSize - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;

            if (error) {
                console.error('❌ Erro na query:', error);
                throw new Error(error.message);
            }

            this.usuarios = data || [];
            this.totalUsuarios = count || 0;
            this.totalPages = Math.ceil(this.totalUsuarios / this.pageSize) || 1;

            console.log(`✅ ${this.usuarios.length} usuários carregados (total: ${this.totalUsuarios})`);

            this.renderUsuarios();
            this.updatePagination();

        } catch (error) {
            console.error('❌ Erro ao carregar usuários:', error);
            window.showToast('Erro ao carregar usuários: ' + error.message, 'error');

            const tbody = document.getElementById('usuariosTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 40px 0; color: #f44336;">
                            <i data-lucide="alert-circle" style="width: 40px; height: 40px; display: block; margin: 0 auto 8px;"></i>
                            <strong>Erro ao carregar usuários</strong>
                            <p style="font-size: 13px; margin-top: 4px; color: var(--gray-500);">${error.message}</p>
                            <button class="btn btn-primary" onclick="window.location.reload()" style="margin-top: 12px;">
                                <i data-lucide="refresh-cw"></i>
                                Tentar novamente
                            </button>
                        </td>
                    </tr>
                `;
                if (window.lucide) lucide.createIcons();
            }
        } finally {
            this.isLoading = false;
        }
    }

    // ============================================
    // RENDER - REAL
    // ============================================
    renderUsuarios() {
        const tbody = document.getElementById('usuariosTableBody');
        if (!tbody) return;

        if (this.usuarios.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px 0; color: var(--gray-400);">
                        <i data-lucide="inbox" style="width: 40px; height: 40px; display: block; margin: 0 auto 8px; color: var(--gray-300);"></i>
                        <p style="font-size: 14px;">${this.searchTerm ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}</p>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        const perfis = {
            admin: 'Administrador',
            tecnico: 'Técnico'
        };

        tbody.innerHTML = this.usuarios.map(user => `
            <tr data-user-id="${user.id}">
                <td><strong>${this.escapeHtml(user.nome || '—')}</strong></td>
                <td>${this.escapeHtml(user.email || '—')}</td>
                <td>
                    <span class="perfil-badge ${user.perfil || 'tecnico'}">
                        ${perfis[user.perfil] || this.escapeHtml(user.perfil) || 'Técnico'}
                    </span>
                </td>
                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                    <span class="status-badge ${user.status === 'inativo' ? 'inativo' : 'ativo'}">
                        ${user.status === 'inativo' ? 'Inativo' : 'Ativo'}
                    </span>
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-edit" data-id="${user.id}" title="Editar">
                            <i data-lucide="edit-2"></i>
                            <span>Editar</span>
                        </button>
                        <button class="btn btn-delete" data-id="${user.id}" title="Excluir">
                            <i data-lucide="trash-2"></i>
                            <span>Excluir</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        if (window.lucide) lucide.createIcons();

        // Event listeners
        tbody.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const user = this.usuarios.find(u => String(u.id) === id);
                if (user) this.openModal(user);
            });
        });

        tbody.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const user = this.usuarios.find(u => String(u.id) === id);
                if (user) {
                    window.showConfirm(`Tem certeza que deseja excluir o usuário "${user.nome}"?`, async () => {
                        await this.deleteUsuario(id);
                    });
                }
            });
        });
    }

    // ============================================
    // UTILITÁRIOS
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // PAGINAÇÃO
    // ============================================
    updatePagination() {
        const info = document.getElementById('paginationInfo');
        const current = document.getElementById('paginationCurrent');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');

        if (info) {
            const start = this.totalUsuarios > 0 ? (this.currentPage - 1) * this.pageSize + 1 : 0;
            const end = Math.min(this.currentPage * this.pageSize, this.totalUsuarios);
            info.textContent = this.totalUsuarios > 0
                ? `Mostrando ${start}-${end} de ${this.totalUsuarios} usuário${this.totalUsuarios !== 1 ? 's' : ''}`
                : 'Nenhum usuário';
        }

        if (current) {
            current.textContent = this.currentPage;
        }

        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }

        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= this.totalPages;
        }

        const countEl = document.getElementById('usuariosCount');
        if (countEl) {
            countEl.textContent = `${this.totalUsuarios} usuário${this.totalUsuarios !== 1 ? 's' : ''}`;
        }
    }

    // ============================================
    // DELETE - REAL (apenas tabela "usuarios")
    // ============================================
    async deleteUsuario(id) {
        try {
            console.log(`🗑️ Excluindo usuário: ${id}`);

            const user = this.usuarios.find(u => String(u.id) === String(id));
            const userName = user?.nome || id;

            const { error: deleteError, count } = await supabase
                .from('usuarios')
                .delete({ count: 'exact' })
                .eq('id', id);

            if (deleteError) {
                throw new Error(deleteError.message);
            }

            if (!count) {
                window.showToast('Usuário não encontrado (já pode ter sido excluído).', 'warning');
            } else {
                window.showToast(`Usuário "${userName}" excluído com sucesso! 🗑️`, 'success');
            }

            console.log('✅ Usuário removido da tabela');

            // Se a exclusão deixou a página atual vazia (e não é a primeira), volta uma página
            if (this.usuarios.length === 1 && this.currentPage > 1) {
                this.currentPage--;
            }

            await this.loadUsuarios();

        } catch (error) {
            console.error('❌ Erro ao excluir usuário:', error);
            window.showToast('Erro ao excluir usuário: ' + error.message, 'error');
        }
    }

    // ============================================
    // CREATE - REAL (apenas tabela "usuarios")
    // ============================================
    async createUsuario(data) {
        try {
            console.log('📝 Criando usuário:', data.email);

            const novoRegistro = {
                id: (crypto.randomUUID && crypto.randomUUID()) || undefined,
                nome: data.nome,
                email: data.email,
                perfil: data.perfil,
                status: data.status || 'ativo',
                created_at: new Date().toISOString()
            };

            // Se o navegador não suportar crypto.randomUUID, deixa o banco gerar o id (default da coluna)
            if (!novoRegistro.id) delete novoRegistro.id;

            const { error } = await supabase
                .from('usuarios')
                .insert([novoRegistro]);

            if (error) {
                throw new Error(error.message);
            }

            console.log('✅ Usuário criado na tabela "usuarios"');
            window.showToast('Usuário criado com sucesso! 🎉', 'success');

            await this.loadUsuarios();
            this.closeModal();

        } catch (error) {
            console.error('❌ Erro ao criar usuário:', error);
            window.showToast('Erro ao criar usuário: ' + error.message, 'error');
        }
    }

    // ============================================
    // UPDATE - REAL (apenas tabela "usuarios")
    // ============================================
    async updateUsuario(id, data) {
        try {
            console.log('📝 Atualizando usuário:', id);

            const updateData = {
                nome: data.nome,
                email: data.email,
                perfil: data.perfil,
                status: data.status || 'ativo',
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('usuarios')
                .update(updateData)
                .eq('id', id);

            if (error) {
                throw new Error(error.message);
            }

            console.log('✅ Usuário atualizado');
            window.showToast('Usuário atualizado com sucesso! ✅', 'success');

            await this.loadUsuarios();
            this.closeModal();

        } catch (error) {
            console.error('❌ Erro ao atualizar usuário:', error);
            window.showToast('Erro ao atualizar usuário: ' + error.message, 'error');
        }
    }

    // ============================================
    // MODAL
    // ============================================
    openModal(data = null) {
        const modal = document.getElementById('usuarioModal');
        if (!modal) return;

        const isEdit = !!data;

        document.getElementById('usuarioId').value = data?.id || '';
        document.getElementById('usuarioNome').value = data?.nome || '';
        document.getElementById('usuarioEmail').value = data?.email || '';
        document.getElementById('usuarioPerfil').value = data?.perfil || 'tecnico';
        document.getElementById('usuarioStatus').value = data?.status || 'ativo';

        if (isEdit) {
            document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuário';
            document.getElementById('saveUsuarioBtn').innerHTML = '<i data-lucide="save"></i> Atualizar';
        } else {
            document.getElementById('modalUsuarioTitle').textContent = 'Novo Usuário';
            document.getElementById('saveUsuarioBtn').innerHTML = '<i data-lucide="user-plus"></i> Criar';
        }

        if (window.lucide) lucide.createIcons();

        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('usuarioNome').focus(), 200);
    }

    closeModal() {
        document.getElementById('usuarioModal').style.display = 'none';
    }

    // ============================================
    // SAVE - REAL
    // ============================================
    async saveUsuario() {
        const id = document.getElementById('usuarioId').value;
        const nome = document.getElementById('usuarioNome').value.trim();
        const email = document.getElementById('usuarioEmail').value.trim();
        const perfil = document.getElementById('usuarioPerfil').value;
        const status = document.getElementById('usuarioStatus').value;

        if (!nome) {
            window.showToast('Informe o nome!', 'error');
            document.getElementById('usuarioNome').focus();
            return;
        }

        if (!email) {
            window.showToast('Informe o e-mail!', 'error');
            document.getElementById('usuarioEmail').focus();
            return;
        }

        if (!email.includes('@') || !email.includes('.')) {
            window.showToast('E-mail inválido!', 'error');
            document.getElementById('usuarioEmail').focus();
            return;
        }

        const data = { nome, email, perfil, status };

        const saveBtn = document.getElementById('saveUsuarioBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="spinner"></span> Salvando...';
        saveBtn.disabled = true;

        try {
            if (id) {
                await this.updateUsuario(id, data);
            } else {
                await this.createUsuario(data);
            }
        } catch (error) {
            console.error('❌ Erro ao salvar:', error);
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    }

    // ============================================
    // EVENTOS
    // ============================================
    setupEvents() {
        // Novo usuário
        document.getElementById('novoUsuarioBtn')?.addEventListener('click', () => {
            this.openModal();
        });

        // Refresh
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            const btn = document.getElementById('refreshBtn');
            const icon = btn.querySelector('i');
            icon.style.animation = 'spin 0.8s linear infinite';
            this.loadUsuarios().finally(() => {
                icon.style.animation = 'none';
            });
        });

        // Fechar modal
        document.getElementById('closeUsuarioModal')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('closeUsuarioModalBtn')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('saveUsuarioBtn')?.addEventListener('click', () => {
            this.saveUsuario();
        });

        // Busca
        const searchInput = document.getElementById('searchUsuarios');
        const clearBtn = document.getElementById('clearSearchBtn');

        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                const value = e.target.value;
                this.searchTerm = value;
                if (clearBtn) {
                    clearBtn.classList.toggle('visible', value.length > 0);
                }
                this.currentPage = 1;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => this.loadUsuarios(), 300);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    this.searchTerm = '';
                    clearBtn.classList.remove('visible');
                    this.currentPage = 1;
                    this.loadUsuarios();
                    searchInput.focus();
                }
            });
        }

        // Paginação
        document.getElementById('prevPageBtn')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadUsuarios();
            }
        });

        document.getElementById('nextPageBtn')?.addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadUsuarios();
            }
        });

        // Enter no formulário
        document.getElementById('usuarioForm')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveUsuario();
            }
        });

        // Fechar modal clicando fora
        document.getElementById('usuarioModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeModal();
            }
        });

        console.log('✅ Eventos configurados');
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
console.log('🚀 Inicializando Gestão...');

const initGestao = async () => {
    try {
        if (window.lucide) lucide.createIcons();

        const manager = new GestaoManager();
        await manager.init();
        window.gestaoManager = manager;

        console.log('✅ Gestão inicializado!');
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);

        const tbody = document.getElementById('usuariosTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px 0; color: #f44336;">
                        <i data-lucide="alert-circle" style="width: 40px; height: 40px; display: block; margin: 0 auto 8px;"></i>
                        <strong>Erro ao inicializar</strong>
                        <p style="font-size: 13px; margin-top: 4px; color: var(--gray-500);">${error.message}</p>
                        <button class="btn btn-primary" onclick="location.reload()" style="margin-top: 12px;">
                            <i data-lucide="refresh-cw"></i>
                            Recarregar página
                        </button>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGestao);
} else {
    initGestao();
}