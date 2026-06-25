// modules/dashboard.js
import supabase from '../services/supabase.js';

export class Dashboard {
    constructor() {
        this.init();
    }

    async init() {
        await this.loadData();
    }

    async loadData() {
        try {
            console.log('📥 Carregando dados do dashboard...');

            // 1. Buscar todos os dados em paralelo
            const [
                clientes,
                servicos,
                servicosConcluidos,
                servicosPendentes,
                servicosCancelados,
                notas,
                servicosComValor
            ] = await Promise.all([
                // Total de clientes
                supabase.from('clientes').select('*', { count: 'exact', head: true }),
                
                // Total de serviços
                supabase.from('servicos').select('*', { count: 'exact', head: true }),
                
                // Serviços concluídos
                supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('status', 'concluido'),
                
                // Serviços pendentes
                supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
                
                // Serviços cancelados
                supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('status', 'cancelado'),
                
                // Notas fiscais
                supabase.from('notas').select('*', { count: 'exact', head: true }),
                
                // Serviços com valor (para calcular valores recebidos)
                supabase.from('servicos').select('valor, status')
            ]);

            // 2. Calcular valores
            const valorTotalConcluidos = servicosComValor.data
                ?.filter(s => s.status === 'concluido')
                ?.reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

            const valorTotalPendentes = servicosComValor.data
                ?.filter(s => s.status === 'pendente')
                ?.reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

            // 3. Buscar últimos serviços
            const { data: ultimosServicos } = await supabase
                .from('servicos')
                .select(`
                    *,
                    clientes:cliente_id(nome)
                `)
                .order('data', { ascending: false })
                .limit(5);

            // 4. Buscar últimas notas
            const { data: ultimasNotas } = await supabase
                .from('notas')
                .select(`
                    *,
                    clientes:cliente_id(nome)
                `)
                .order('data_emissao', { ascending: false })
                .limit(5);

            // 5. Atualizar UI com os dados
            this.updateStats({
                clientes: clientes.count || 0,
                servicos: servicos.count || 0,
                servicosConcluidos: servicosConcluidos.count || 0,
                servicosPendentes: servicosPendentes.count || 0,
                servicosCancelados: servicosCancelados.count || 0,
                notas: notas.count || 0,
                valorRecebido: valorTotalConcluidos,
                valorAReceber: valorTotalPendentes
            });

            // 6. Renderizar listas
            this.renderUltimosServicos(ultimosServicos || []);
            this.renderUltimasNotas(ultimasNotas || []);

            console.log('✅ Dashboard carregado com sucesso!');

        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
            this.showNotification('Erro ao carregar dados!', 'error');
        }
    }

    updateStats(data) {
        // Atualizar cards
        const elements = {
            totalClientes: data.clientes,
            totalServicos: data.servicos,
            servicosConcluidos: data.servicosConcluidos,
            servicosPendentes: data.servicosPendentes,
            servicosCancelados: data.servicosCancelados,
            totalNotas: data.notas,
            valorRecebido: `R$ ${data.valorRecebido.toFixed(2)}`,
            valorAReceber: `R$ ${data.valorAReceber.toFixed(2)}`
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
                
                // Adicionar classes de cor para valores
                if (id === 'valorRecebido') {
                    el.className = 'stat-value success';
                } else if (id === 'valorAReceber') {
                    el.className = 'stat-value warning';
                } else if (id === 'servicosCancelados') {
                    el.className = 'stat-value danger';
                } else if (id === 'servicosConcluidos') {
                    el.className = 'stat-value success';
                } else if (id === 'servicosPendentes') {
                    el.className = 'stat-value warning';
                } else if (id === 'totalClientes') {
                    el.className = 'stat-value primary';
                }
            }
        });
    }

    renderUltimosServicos(servicos) {
        const container = document.getElementById('ultimosServicos');
        if (!container) return;

        if (servicos.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <p style="color: var(--gray-400);">Nenhum serviço registrado</p>
                </div>
            `;
            return;
        }

        const statusLabels = {
            'pendente': 'Pendente',
            'concluido': 'Concluído',
            'cancelado': 'Cancelado'
        };

        container.innerHTML = servicos.map(s => `
            <div class="servico-item">
                <div class="servico-info">
                    <span class="servico-nome">${s.servico}</span>
                    <span class="servico-cliente">👤 ${s.clientes?.nome || 'Cliente não informado'}</span>
                </div>
                <div class="servico-meta">
                    ${s.valor ? `<span class="servico-valor">R$ ${s.valor.toFixed(2)}</span>` : ''}
                    <span class="servico-status ${s.status}">${statusLabels[s.status] || s.status}</span>
                    <span class="servico-data">📅 ${s.data}</span>
                </div>
            </div>
        `).join('');
    }

    renderUltimasNotas(notas) {
        const container = document.getElementById('ultimasNotas');
        if (!container) return;

        if (notas.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <p style="color: var(--gray-400);">Nenhuma nota fiscal registrada</p>
                </div>
            `;
            return;
        }

        container.innerHTML = notas.map(n => `
            <div class="nota-item">
                <div class="nota-info">
                    <span class="nota-servico">${n.servico_prestado}</span>
                    <span class="nota-cliente">👤 ${n.clientes?.nome || 'Cliente não informado'}</span>
                </div>
                <div class="nota-meta">
                    <span class="nota-valor">R$ ${n.valor.toFixed(2)}</span>
                    ${n.numero_nota ? `<span class="nota-numero">#${n.numero_nota}</span>` : ''}
                    <span class="nota-data">📅 ${n.data_emissao}</span>
                    ${n.arquivo_url ? `<a href="${n.arquivo_url}" target="_blank" class="nota-arquivo" title="Ver arquivo">📎</a>` : ''}
                </div>
            </div>
        `).join('');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}