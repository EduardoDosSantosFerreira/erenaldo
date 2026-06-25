// modules/clientes.js
import supabase from '../services/supabase.js';

export class ClientesManager {
    constructor() {
        this.clientes = [];
        this.searchTerm = '';
        this.filtroTipo = '';
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando ClientesManager...');
        await this.loadClientes();
    }

    async loadClientes() {
        try {
            console.log('📥 Carregando clientes...');
            
            let query = supabase
                .from('clientes')
                .select('*')
                .order('nome');

            if (this.searchTerm) {
                query = query.ilike('nome', `%${this.searchTerm}%`);
            }

            if (this.filtroTipo) {
                query = query.eq('tipo', this.filtroTipo);
            }

            const { data, error } = await query;
            
            if (error) throw error;

            this.clientes = data || [];
            console.log(`✅ ${this.clientes.length} clientes carregados`);
            this.renderClientes();
            this.updateStats();

        } catch (error) {
            console.error('❌ Erro ao carregar clientes:', error);
            this.showNotification('Erro ao carregar clientes!', 'error');
            
            const container = document.getElementById('clientesList');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i data-lucide="alert-circle" class="empty-icon"></i>
                        <h3>Erro ao carregar clientes</h3>
                        <p style="color: var(--gray-500);">${error.message || 'Erro desconhecido'}</p>
                        <button class="btn btn-primary" onclick="location.reload()" style="margin-top: 16px;">
                            <i data-lucide="refresh-cw"></i>
                            Tentar novamente
                        </button>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    renderClientes() {
        const container = document.getElementById('clientesList');
        if (!container) return;

        if (this.clientes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="users" class="empty-icon"></i>
                    <h3>Nenhum cliente encontrado</h3>
                    <p style="color: var(--gray-500);">Clique em "Novo Cliente" para começar</p>
                    <button class="btn btn-primary" id="emptyNovoClienteBtn" style="margin-top: 16px;">
                        <i data-lucide="user-plus"></i>
                        Novo Cliente
                    </button>
                </div>
            `;
            
            if (window.lucide) lucide.createIcons();
            
            document.getElementById('emptyNovoClienteBtn')?.addEventListener('click', () => {
                this.openModal();
            });
            return;
        }

        const tipoLabels = {
            'residencial': 'Residencial',
            'empresa': 'Empresa'
        };

        const tipoIcons = {
            'residencial': 'home',
            'empresa': 'building-2'
        };

        container.innerHTML = this.clientes.map(cliente => `
            <div class="cliente-card" data-id="${cliente.id}">
                <div class="card-header">
                    <h3>${this.escapeHtml(cliente.nome)}</h3>
                    <span class="badge-tipo ${cliente.tipo}">
                        <i data-lucide="${tipoIcons[cliente.tipo] || 'user'}"></i>
                        ${tipoLabels[cliente.tipo] || cliente.tipo}
                    </span>
                </div>
                <div class="card-body">
                    ${cliente.telefone ? `<p><i data-lucide="phone"></i> ${this.escapeHtml(cliente.telefone)}</p>` : ''}
                    ${cliente.email ? `<p><i data-lucide="mail"></i> ${this.escapeHtml(cliente.email)}</p>` : ''}
                    ${cliente.endereco ? `<p><i data-lucide="map-pin"></i> ${this.escapeHtml(cliente.endereco)}</p>` : ''}
                </div>
                <div class="card-footer">
                    <button class="btn btn-primary btn-sm btn-edit" data-id="${cliente.id}">
                        <i data-lucide="edit-2"></i>
                        Editar
                    </button>
                    <button class="btn btn-danger btn-sm btn-delete" data-id="${cliente.id}">
                        <i data-lucide="trash-2"></i>
                        Excluir
                    </button>
                </div>
            </div>
        `).join('');

        if (window.lucide) lucide.createIcons();

        // Event listeners
        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const cliente = this.clientes.find(c => c.id === id);
                if (cliente) this.openModal(cliente);
            });
        });

        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                if (window.showConfirm) {
                    window.showConfirm('Excluir este cliente?', () => {
                        this.deleteCliente(id);
                    });
                } else {
                    this.deleteCliente(id);
                }
            });
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateStats() {
        const total = this.clientes.length;
        const empresas = this.clientes.filter(c => c.tipo === 'empresa').length;
        const residenciais = this.clientes.filter(c => c.tipo === 'residencial').length;

        document.getElementById('totalClientes').textContent = total;
        document.getElementById('totalEmpresas').textContent = empresas;
        document.getElementById('totalResidenciais').textContent = residenciais;
    }

    validateForm() {
        let isValid = true;

        // Validar Nome
        const nome = document.getElementById('clienteNome');
        const nomeError = document.getElementById('nomeError');
        const nomeGroup = document.getElementById('nomeGroup');
        
        if (!nome.value.trim()) {
            nomeGroup.classList.add('error');
            nomeError.classList.add('show');
            isValid = false;
        } else {
            nomeGroup.classList.remove('error');
            nomeError.classList.remove('show');
        }

        // Validar Telefone (opcional, mas se preenchido deve ser válido)
        const telefone = document.getElementById('clienteTelefone');
        const telefoneError = document.getElementById('telefoneError');
        const telefoneGroup = document.getElementById('telefoneGroup');
        
        if (telefone.value.trim()) {
            const telClean = telefone.value.replace(/\D/g, '');
            if (telClean.length < 10 || telClean.length > 11) {
                telefoneGroup.classList.add('error');
                telefoneError.classList.add('show');
                isValid = false;
            } else {
                telefoneGroup.classList.remove('error');
                telefoneError.classList.remove('show');
            }
        } else {
            telefoneGroup.classList.remove('error');
            telefoneError.classList.remove('show');
        }

        // Validar Email (opcional, mas se preenchido deve ser válido)
        const email = document.getElementById('clienteEmail');
        const emailError = document.getElementById('emailError');
        const emailGroup = document.getElementById('emailGroup');
        
        if (email.value.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.value.trim())) {
                emailGroup.classList.add('error');
                emailError.classList.add('show');
                isValid = false;
            } else {
                emailGroup.classList.remove('error');
                emailError.classList.remove('show');
            }
        } else {
            emailGroup.classList.remove('error');
            emailError.classList.remove('show');
        }

        return isValid;
    }

    async createCliente(data) {
        try {
            console.log('📝 Criando cliente:', data);
            
            const { error } = await supabase
                .from('clientes')
                .insert([data]);

            if (error) throw error;

            this.showNotification('Cliente criado com sucesso! 🎉', 'success');
            await this.loadClientes();
            this.closeModal();
        } catch (error) {
            console.error('❌ Erro ao criar cliente:', error);
            this.showNotification('Erro ao criar cliente: ' + error.message, 'error');
        }
    }

    async updateCliente(id, data) {
        try {
            console.log('📝 Atualizando cliente:', id);
            
            const { error } = await supabase
                .from('clientes')
                .update(data)
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Cliente atualizado com sucesso! ✅', 'success');
            await this.loadClientes();
            this.closeModal();
        } catch (error) {
            console.error('❌ Erro ao atualizar cliente:', error);
            this.showNotification('Erro ao atualizar cliente: ' + error.message, 'error');
        }
    }

    async deleteCliente(id) {
        try {
            console.log('🗑️ Excluindo cliente:', id);
            
            // Verificar se o cliente tem serviços associados
            const { data: servicos, error: servicosError } = await supabase
                .from('servicos')
                .select('id')
                .eq('cliente_id', id)
                .limit(1);

            if (servicosError) throw servicosError;

            if (servicos && servicos.length > 0) {
                this.showNotification('Este cliente possui serviços associados. Exclua os serviços primeiro.', 'warning');
                return;
            }

            const { error } = await supabase
                .from('clientes')
                .delete()
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Cliente excluído com sucesso! 🗑️', 'success');
            await this.loadClientes();
        } catch (error) {
            console.error('❌ Erro ao excluir cliente:', error);
            this.showNotification('Erro ao excluir cliente: ' + error.message, 'error');
        }
    }

    openModal(data = null) {
        const modal = document.getElementById('clienteModal');
        if (!modal) return;

        // Limpar erros
        document.querySelectorAll('.form-group').forEach(g => g.classList.remove('error'));
        document.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));

        if (data) {
            document.getElementById('clienteId').value = data.id;
            document.getElementById('clienteNome').value = data.nome || '';
            document.getElementById('clienteTipo').value = data.tipo || 'residencial';
            document.getElementById('clienteTelefone').value = data.telefone || '';
            document.getElementById('clienteEmail').value = data.email || '';
            document.getElementById('clienteEndereco').value = data.endereco || '';
            document.getElementById('modalTitle').textContent = 'Editar Cliente';
        } else {
            document.getElementById('clienteId').value = '';
            document.getElementById('clienteNome').value = '';
            document.getElementById('clienteTipo').value = 'residencial';
            document.getElementById('clienteTelefone').value = '';
            document.getElementById('clienteEmail').value = '';
            document.getElementById('clienteEndereco').value = '';
            document.getElementById('modalTitle').textContent = 'Novo Cliente';
        }

        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
        
        // Focar no primeiro campo
        setTimeout(() => {
            document.getElementById('clienteNome').focus();
        }, 300);
    }

    closeModal() {
        document.getElementById('clienteModal').style.display = 'none';
    }

    async saveCliente() {
        // Validar formulário
        if (!this.validateForm()) {
            this.showNotification('Preencha os campos corretamente.', 'error');
            return;
        }

        const id = document.getElementById('clienteId').value;
        const nome = document.getElementById('clienteNome').value.trim();
        const tipo = document.getElementById('clienteTipo').value;
        const telefone = document.getElementById('clienteTelefone').value.trim();
        const email = document.getElementById('clienteEmail').value.trim();
        const endereco = document.getElementById('clienteEndereco').value.trim();

        const clienteData = {
            nome: nome,
            tipo: tipo,
            telefone: telefone || null,
            email: email || null,
            endereco: endereco || null
        };

        // Mostrar loading no botão
        const saveBtn = document.getElementById('saveClienteBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="spinner" style="display:inline-block;width:20px;height:20px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;"></span> Salvando...';
        saveBtn.disabled = true;

        try {
            if (id) {
                await this.updateCliente(id, clienteData);
            } else {
                await this.createCliente(clienteData);
            }
        } catch (error) {
            console.error('❌ Erro ao salvar:', error);
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    showNotification(message, type = 'info') {
        console.log(`📢 ${type}: ${message}`);
        // Será sobrescrito pelo HTML
    }
}