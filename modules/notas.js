// modules/notas.js
import supabase from '../services/supabase.js';

export class NotasManager {
    constructor() {
        this.notas = [];
        this.clientes = [];
        this.servicos = [];
        this.searchTerm = '';
        this.init();
    }

    async init() {
        await this.loadClientes();
        await this.loadServicos();
        await this.loadNotas();
        this.setupEventListeners();
    }

    async loadClientes() {
        try {
            const { data } = await supabase
                .from('clientes')
                .select('id, nome')
                .order('nome');

            this.clientes = data || [];
            this.populateClienteSelects();
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
        }
    }

    async loadServicos() {
        try {
            const { data } = await supabase
                .from('servicos')
                .select('id, servico, cliente_id')
                .order('data', { ascending: false });

            this.servicos = data || [];
            this.populateServicoSelect();
        } catch (error) {
            console.error('Erro ao carregar serviços:', error);
        }
    }

    populateClienteSelects() {
        const selects = ['notaCliente', 'filtroClienteNota'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = `
                <option value="">${id === 'filtroClienteNota' ? 'Todos os clientes' : 'Selecione um cliente...'}</option>
                ${this.clientes.map(c => 
                    `<option value="${c.id}">${c.nome}</option>`
                ).join('')}
            `;
            if (currentValue) select.value = currentValue;
        });
    }

    populateServicoSelect() {
        const select = document.getElementById('notaServico');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = `
            <option value="">Nenhum serviço relacionado</option>
            ${this.servicos.map(s => {
                const cliente = this.clientes.find(c => c.id === s.cliente_id);
                return `<option value="${s.id}">${s.servico}${cliente ? ` - ${cliente.nome}` : ''}</option>`;
            }).join('')}
        `;
        if (currentValue) select.value = currentValue;
    }

    async loadNotas() {
        try {
            let query = supabase
                .from('notas')
                .select(`
                    *,
                    clientes:cliente_id(nome),
                    servicos:servico_id(servico)
                `)
                .order('data_emissao', { ascending: false });

            if (this.searchTerm) {
                query = query.ilike('servico_prestado', `%${this.searchTerm}%`);
            }

            const filtroCliente = document.getElementById('filtroClienteNota')?.value;
            if (filtroCliente) {
                query = query.eq('cliente_id', filtroCliente);
            }

            const { data, error } = await query;
            if (error) throw error;

            this.notas = data || [];
            this.renderNotas();
            this.updateStats();
        } catch (error) {
            console.error('Erro ao carregar notas:', error);
            this.showNotification('Erro ao carregar notas!', 'error');
        }
    }

    renderNotas() {
        const container = document.getElementById('notasList');
        if (!container) return;

        if (this.notas.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="file-text" class="empty-icon"></i>
                    <h3>Nenhuma nota fiscal</h3>
                    <p>Clique em "Nova Nota" para começar</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.notas.map(nota => `
            <div class="card-item" data-id="${nota.id}">
                <div class="card-header">
                    <h3>${nota.servico_prestado}</h3>
                    <span style="font-size: 12px; color: var(--gray-500);">${nota.numero_nota || 'Sem número'}</span>
                </div>
                <div class="card-body">
                    <p><strong>Cliente:</strong> ${nota.clientes?.nome || 'Não informado'}</p>
                    <p><strong>Data:</strong> ${nota.data_emissao}</p>
                    <p><strong>Valor:</strong> R$ ${nota.valor.toFixed(2)}</p>
                    ${nota.servicos?.servico ? `<p><strong>Serviço:</strong> ${nota.servicos.servico}</p>` : ''}
                    ${nota.arquivo_url ? 
                        `<p><a href="${nota.arquivo_url}" target="_blank" style="color: var(--primary);">📄 ${nota.arquivo_nome || 'Ver arquivo'}</a></p>` : 
                        '<p style="color: var(--gray-400);">Sem arquivo anexado</p>'
                    }
                </div>
                <div class="card-footer">
                    <button class="btn btn-primary btn-sm btn-edit" data-id="${nota.id}">Editar</button>
                    <button class="btn btn-danger btn-sm btn-delete" data-id="${nota.id}">Excluir</button>
                </div>
            </div>
        `).join('');

        if (window.lucide) lucide.createIcons();
    }

    updateStats() {
        const total = this.notas.length;
        const valorTotal = this.notas.reduce((sum, n) => sum + n.valor, 0);
        const comArquivo = this.notas.filter(n => n.arquivo_url).length;

        document.getElementById('totalNotas').textContent = total;
        document.getElementById('valorTotalNotas').textContent = `R$ ${valorTotal.toFixed(2)}`;
        document.getElementById('notasComArquivo').textContent = comArquivo;
    }

    async uploadFile(file) {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `notas/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('notas')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('notas')
                .getPublicUrl(filePath);

            return { url: publicUrl, name: file.name };
        } catch (error) {
            console.error('Erro ao fazer upload:', error);
            this.showNotification('Erro ao fazer upload do arquivo!', 'error');
            return null;
        }
    }

    async createNota(data, file) {
        try {
            let arquivo_url = null;
            let arquivo_nome = null;

            if (file) {
                const upload = await this.uploadFile(file);
                if (upload) {
                    arquivo_url = upload.url;
                    arquivo_nome = upload.name;
                }
            }

            const notaData = {
                ...data,
                arquivo_url,
                arquivo_nome
            };

            const { error } = await supabase
                .from('notas')
                .insert([notaData]);

            if (error) throw error;

            this.showNotification('Nota criada com sucesso!', 'success');
            await this.loadNotas();
            this.closeModal();
        } catch (error) {
            console.error('Erro:', error);
            this.showNotification('Erro ao criar nota!', 'error');
        }
    }

    async updateNota(id, data, file) {
        try {
            let arquivo_url = data.arquivo_url;
            let arquivo_nome = data.arquivo_nome;

            if (file) {
                const upload = await this.uploadFile(file);
                if (upload) {
                    arquivo_url = upload.url;
                    arquivo_nome = upload.name;
                }
            }

            const updateData = {
                cliente_id: data.cliente_id,
                servico_id: data.servico_id || null,
                numero_nota: data.numero_nota,
                servico_prestado: data.servico_prestado,
                data_emissao: data.data_emissao,
                valor: data.valor,
                arquivo_url,
                arquivo_nome
            };

            const { error } = await supabase
                .from('notas')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Nota atualizada!', 'success');
            await this.loadNotas();
            this.closeModal();
        } catch (error) {
            console.error('Erro:', error);
            this.showNotification('Erro ao atualizar nota!', 'error');
        }
    }

    async deleteNota(id) {
        if (!confirm('Tem certeza que deseja excluir esta nota?')) return;

        try {
            const { error } = await supabase
                .from('notas')
                .delete()
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Nota excluída!', 'success');
            await this.loadNotas();
        } catch (error) {
            console.error('Erro:', error);
            this.showNotification('Erro ao excluir nota!', 'error');
        }
    }

    openModal(data = null) {
        const modal = document.getElementById('notaModal');
        if (!modal) return;

        this.populateClienteSelects();
        this.populateServicoSelect();

        if (data) {
            document.getElementById('notaId').value = data.id;
            document.getElementById('notaCliente').value = data.cliente_id;
            document.getElementById('notaNumero').value = data.numero_nota || '';
            document.getElementById('notaServicoPrestado').value = data.servico_prestado;
            document.getElementById('notaServico').value = data.servico_id || '';
            document.getElementById('notaData').value = data.data_emissao;
            document.getElementById('notaValor').value = data.valor;
            if (data.arquivo_nome) {
                document.getElementById('fileName').textContent = `📄 ${data.arquivo_nome}`;
                document.getElementById('fileUpload').classList.add('has-file');
            }
            document.getElementById('modalTitle').textContent = 'Editar Nota Fiscal';
        } else {
            document.getElementById('notaId').value = '';
            document.getElementById('notaCliente').value = '';
            document.getElementById('notaNumero').value = '';
            document.getElementById('notaServicoPrestado').value = '';
            document.getElementById('notaServico').value = '';
            document.getElementById('notaData').value = new Date().toISOString().split('T')[0];
            document.getElementById('notaValor').value = '';
            document.getElementById('fileName').textContent = '';
            document.getElementById('fileUpload').classList.remove('has-file');
            document.getElementById('notaArquivo').value = '';
            document.getElementById('modalTitle').textContent = 'Nova Nota Fiscal';
        }

        modal.style.display = 'flex';
    }

    closeModal() {
        document.getElementById('notaModal').style.display = 'none';
    }

    async saveNota() {
        const id = document.getElementById('notaId').value;
        const clienteId = document.getElementById('notaCliente').value;
        const servicoId = document.getElementById('notaServico').value;
        const numero = document.getElementById('notaNumero').value.trim();
        const servicoPrestado = document.getElementById('notaServicoPrestado').value.trim();
        const data = document.getElementById('notaData').value;
        const valor = parseFloat(document.getElementById('notaValor').value);
        const file = document.getElementById('notaArquivo').files[0];

        if (!clienteId) {
            this.showNotification('Selecione um cliente!', 'error');
            return;
        }

        if (!servicoPrestado) {
            this.showNotification('Informe o serviço prestado!', 'error');
            return;
        }

        if (!data) {
            this.showNotification('Informe a data!', 'error');
            return;
        }

        if (!valor || valor <= 0) {
            this.showNotification('Informe um valor válido!', 'error');
            return;
        }

        const notaData = {
            cliente_id: clienteId,
            servico_id: servicoId || null,
            numero_nota: numero,
            servico_prestado: servicoPrestado,
            data_emissao: data,
            valor: valor
        };

        if (id) {
            await this.updateNota(id, notaData, file);
        } else {
            await this.createNota(notaData, file);
        }
    }

    setupEventListeners() {
        document.getElementById('searchNotas')?.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.loadNotas();
        });

        document.getElementById('filtroClienteNota')?.addEventListener('change', () => {
            this.loadNotas();
        });

        document.getElementById('notasList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const id = btn.dataset.id;
            const nota = this.notas.find(n => n.id === id);

            if (btn.classList.contains('btn-edit') && nota) {
                this.openModal(nota);
            } else if (btn.classList.contains('btn-delete')) {
                this.deleteNota(id);
            }
        });
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}