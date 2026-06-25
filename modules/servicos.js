// modules/servicos.js
import supabase from '../services/supabase.js';

export class ServicosManager {
    constructor() {
        this.servicos = [];
        this.clientes = [];
        this.filters = {
            status: 'todos',
            cliente: '',
            periodo: 'todos'
        };
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando ServicosManager...');
        await this.loadClientes();
        await this.loadServicos();
        this.setupEventListeners();
    }

    async loadClientes() {
        try {
            console.log('📥 Carregando clientes...');
            const { data, error } = await supabase
                .from('clientes')
                .select('id, nome')
                .order('nome');

            if (error) throw error;

            this.clientes = data || [];
            console.log(`✅ ${this.clientes.length} clientes carregados`);
            this.populateClienteSelects();
        } catch (error) {
            console.error('❌ Erro ao carregar clientes:', error);
            this.showNotification('Erro ao carregar clientes!', 'error');
        }
    }

    populateClienteSelects() {
        const selects = ['servicoCliente', 'filtroCliente'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = `
                <option value="">${id === 'filtroCliente' ? 'Todos' : 'Selecione um cliente...'}</option>
                ${this.clientes.map(c => 
                    `<option value="${c.id}">${c.nome}</option>`
                ).join('')}
            `;
            if (currentValue) select.value = currentValue;
        });
    }

    async loadServicos() {
        try {
            console.log('📥 Carregando serviços...', this.filters);
            
            let query = supabase
                .from('servicos')
                .select(`
                    *,
                    clientes:cliente_id(nome)
                `)
                .order('data', { ascending: false });

            if (this.filters.status && this.filters.status !== 'todos') {
                query = query.eq('status', this.filters.status);
            }

            if (this.filters.cliente) {
                query = query.eq('cliente_id', this.filters.cliente);
            }

            if (this.filters.periodo === 'hoje') {
                const hoje = new Date().toISOString().split('T')[0];
                query = query.eq('data', hoje);
            } else if (this.filters.periodo === 'semana') {
                const inicio = this.getStartOfWeek();
                const fim = this.getEndOfWeek();
                query = query.gte('data', inicio).lte('data', fim);
            } else if (this.filters.periodo === 'mes') {
                const inicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
                const fim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
                query = query.gte('data', inicio).lte('data', fim);
            }

            const { data, error } = await query;
            
            if (error) throw error;

            this.servicos = data || [];
            console.log(`✅ ${this.servicos.length} serviços carregados`);
            this.renderServicos();
            this.updateStats();

        } catch (error) {
            console.error('❌ Erro ao carregar serviços:', error);
            this.showNotification('Erro ao carregar serviços!', 'error');
            
            const container = document.getElementById('servicosList');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i data-lucide="alert-circle" class="empty-icon"></i>
                        <h3>Erro ao carregar serviços</h3>
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

    renderServicos() {
        const container = document.getElementById('servicosList');
        if (!container) {
            console.warn('⚠️ Container servicosList não encontrado');
            return;
        }

        if (this.servicos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="briefcase" class="empty-icon"></i>
                    <h3>Nenhum serviço encontrado</h3>
                    <p style="color: var(--gray-500);">Clique em "Novo Serviço" para começar</p>
                    <button class="btn btn-primary" id="emptyNovoServicoBtn" style="margin-top: 16px;">
                        <i data-lucide="plus"></i>
                        Novo Serviço
                    </button>
                </div>
            `;
            
            if (window.lucide) lucide.createIcons();
            
            document.getElementById('emptyNovoServicoBtn')?.addEventListener('click', () => {
                this.openModal();
            });
            return;
        }

        const statusLabels = {
            'pendente': 'Pendente',
            'concluido': 'Concluído',
            'cancelado': 'Cancelado'
        };

        container.innerHTML = this.servicos.map(servico => `
            <div class="servico-card" data-id="${servico.id}">
                <div class="card-header">
                    <h3>${servico.servico || 'Sem título'}</h3>
                    <span class="badge-status ${servico.status || 'pendente'}">
                        <i data-lucide="${servico.status === 'pendente' ? 'clock' : servico.status === 'concluido' ? 'check-circle' : 'x-circle'}"></i>
                        ${statusLabels[servico.status] || servico.status}
                    </span>
                </div>
                <div class="card-body">
                    <p><strong>Cliente:</strong> <span class="cliente-nome">${servico.clientes?.nome || 'Não informado'}</span></p>
                    <p><strong>Data:</strong> ${servico.data || '---'}</p>
                    ${servico.descricao ? `<p><strong>Descrição:</strong> ${servico.descricao}</p>` : ''}
                    ${servico.valor ? `<p><strong>Valor:</strong> <span class="valor">R$ ${servico.valor.toFixed(2)}</span></p>` : ''}
                </div>
                <div class="card-footer">
                    <button class="btn btn-primary btn-sm btn-edit" data-id="${servico.id}">
                        <i data-lucide="edit-2"></i>
                        Editar
                    </button>
                    ${servico.status !== 'concluido' ? `
                        <button class="btn btn-success btn-sm btn-complete" data-id="${servico.id}">
                            <i data-lucide="check"></i>
                            Concluir
                        </button>
                    ` : ''}
                    <button class="btn btn-danger btn-sm btn-delete" data-id="${servico.id}">
                        <i data-lucide="trash-2"></i>
                        Excluir
                    </button>
                </div>
            </div>
        `).join('');

        if (window.lucide) lucide.createIcons();

        // Event listeners para os botões
        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const servico = this.servicos.find(s => s.id === id);
                if (servico) this.openModal(servico);
            });
        });

        container.querySelectorAll('.btn-complete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.completeServico(id);
            });
        });

        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                if (window.showConfirm) {
                    window.showConfirm('Excluir este serviço?', () => {
                        this.deleteServico(id);
                    });
                } else {
                    this.deleteServico(id);
                }
            });
        });
    }

    updateStats() {
        const total = this.servicos.length;
        const concluidos = this.servicos.filter(s => s.status === 'concluido').length;
        const pendentes = this.servicos.filter(s => s.status === 'pendente').length;
        const valorTotal = this.servicos.reduce((sum, s) => sum + (s.valor || 0), 0);

        document.getElementById('totalServicos').textContent = total;
        document.getElementById('servicosConcluidos').textContent = concluidos;
        document.getElementById('servicosPendentes').textContent = pendentes;
        document.getElementById('valorTotalServicos').textContent = `R$ ${valorTotal.toFixed(2)}`;
    }

    async createServico(data) {
        try {
            console.log('📝 Criando serviço:', data);
            const { error } = await supabase
                .from('servicos')
                .insert([data]);

            if (error) throw error;

            this.showNotification('Serviço criado com sucesso!', 'success');
            await this.loadServicos();
            this.closeModal();
        } catch (error) {
            console.error('❌ Erro ao criar serviço:', error);
            this.showNotification('Erro ao criar serviço: ' + error.message, 'error');
        }
    }

    async updateServico(id, data) {
        try {
            console.log('📝 Atualizando serviço:', id, data);
            const { error } = await supabase
                .from('servicos')
                .update(data)
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Serviço atualizado com sucesso!', 'success');
            await this.loadServicos();
            this.closeModal();
        } catch (error) {
            console.error('❌ Erro ao atualizar serviço:', error);
            this.showNotification('Erro ao atualizar serviço: ' + error.message, 'error');
        }
    }

    async deleteServico(id) {
        try {
            console.log('🗑️ Excluindo serviço:', id);
            const { error } = await supabase
                .from('servicos')
                .delete()
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Serviço excluído com sucesso!', 'success');
            await this.loadServicos();
        } catch (error) {
            console.error('❌ Erro ao excluir serviço:', error);
            this.showNotification('Erro ao excluir serviço: ' + error.message, 'error');
        }
    }

    async completeServico(id) {
        try {
            console.log('✅ Concluindo serviço:', id);
            const { error } = await supabase
                .from('servicos')
                .update({ status: 'concluido' })
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Serviço concluído com sucesso!', 'success');
            await this.loadServicos();
        } catch (error) {
            console.error('❌ Erro ao concluir serviço:', error);
            this.showNotification('Erro ao concluir serviço: ' + error.message, 'error');
        }
    }

    openModal(data = null) {
        const modal = document.getElementById('servicoModal');
        if (!modal) return;

        this.populateClienteSelects();

        if (data) {
            document.getElementById('servicoId').value = data.id;
            document.getElementById('servicoCliente').value = data.cliente_id;
            document.getElementById('servicoNome').value = data.servico;
            document.getElementById('servicoDescricao').value = data.descricao || '';
            document.getElementById('servicoData').value = data.data;
            document.getElementById('servicoValor').value = data.valor || '';
            document.getElementById('servicoStatus').value = data.status;
            document.getElementById('modalTitle').textContent = 'Editar Serviço';
        } else {
            document.getElementById('servicoId').value = '';
            document.getElementById('servicoCliente').value = '';
            document.getElementById('servicoNome').value = '';
            document.getElementById('servicoDescricao').value = '';
            document.getElementById('servicoData').value = new Date().toISOString().split('T')[0];
            document.getElementById('servicoValor').value = '';
            document.getElementById('servicoStatus').value = 'pendente';
            document.getElementById('modalTitle').textContent = 'Novo Serviço';
        }

        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
    }

    closeModal() {
        document.getElementById('servicoModal').style.display = 'none';
    }

    async saveServico() {
        const id = document.getElementById('servicoId').value;
        const clienteId = document.getElementById('servicoCliente').value;
        const nome = document.getElementById('servicoNome').value.trim();
        const descricao = document.getElementById('servicoDescricao').value.trim();
        const data = document.getElementById('servicoData').value;
        const valor = parseFloat(document.getElementById('servicoValor').value) || null;
        const status = document.getElementById('servicoStatus').value;

        // Validações
        if (!clienteId) {
            this.showNotification('Selecione um cliente!', 'error');
            return;
        }

        if (!nome) {
            this.showNotification('Informe o nome do serviço!', 'error');
            return;
        }

        if (!data) {
            this.showNotification('Informe a data!', 'error');
            return;
        }

        const servicoData = {
            cliente_id: clienteId,
            servico: nome,
            descricao: descricao || null,
            data: data,
            valor: valor,
            status: status
        };

        if (id) {
            await this.updateServico(id, servicoData);
        } else {
            await this.createServico(servicoData);
        }
    }

    getStartOfWeek() {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now);
        monday.setDate(diff);
        return monday.toISOString().split('T')[0];
    }

    getEndOfWeek() {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? 0 : 7 - day);
        const sunday = new Date(now);
        sunday.setDate(diff);
        return sunday.toISOString().split('T')[0];
    }

    setupEventListeners() {
        // Os eventos já estão configurados no HTML
        console.log('✅ Event listeners configurados');
    }

    showNotification(message, type = 'info') {
        console.log(`📢 ${type}: ${message}`);
        // Será sobrescrito pelo HTML
    }
}