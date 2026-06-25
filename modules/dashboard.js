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
            // Buscar dados em paralelo
            const [clientes, servicos, notas] = await Promise.all([
                supabase.from('clientes').select('*', { count: 'exact', head: true }),
                supabase.from('servicos').select('*', { count: 'exact', head: true }),
                supabase.from('notas').select('*', { count: 'exact', head: true })
            ]);

            // Serviços pendentes
            const { count: pendentes } = await supabase
                .from('servicos')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pendente');

            // Últimos serviços
            const { data: ultimosServicos } = await supabase
                .from('servicos')
                .select('*, clientes(nome)')
                .order('data', { ascending: false })
                .limit(5);

            // Últimas notas
            const { data: ultimasNotas } = await supabase
                .from('notas')
                .select('*, clientes(nome)')
                .order('data_emissao', { ascending: false })
                .limit(5);

            // Atualizar UI
            this.updateStats({
                clientes: clientes.count || 0,
                servicos: servicos.count || 0,
                notas: notas.count || 0,
                pendentes: pendentes || 0
            });

            this.renderUltimosServicos(ultimosServicos || []);
            this.renderUltimasNotas(ultimasNotas || []);

        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
        }
    }

    updateStats(data) {
        const elements = {
            totalClientes: data.clientes,
            totalServicos: data.servicos,
            totalNotas: data.notas,
            servicosPendentes: data.pendentes
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    renderUltimosServicos(servicos) {
        const container = document.getElementById('ultimosServicos');
        if (!container) return;

        if (servicos.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <p>Nenhum serviço registrado</p>
                </div>
            `;
            return;
        }

        container.innerHTML = servicos.map(s => `
            <div class="card-item" style="margin-bottom: 8px;">
                <div class="card-header">
                    <h3>${s.servico}</h3>
                    <span class="badge ${s.status}">${s.status === 'pendente' ? 'Pendente' : s.status === 'concluido' ? 'Concluído' : 'Cancelado'}</span>
                </div>
                <div class="card-body">
                    <p><strong>Cliente:</strong> ${s.clientes?.nome || 'Não informado'}</p>
                    <p><strong>Data:</strong> ${s.data}</p>
                    ${s.valor ? `<p><strong>Valor:</strong> R$ ${s.valor.toFixed(2)}</p>` : ''}
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
                    <p>Nenhuma nota fiscal registrada</p>
                </div>
            `;
            return;
        }

        container.innerHTML = notas.map(n => `
            <div class="card-item" style="margin-bottom: 8px;">
                <div class="card-header">
                    <h3>${n.servico_prestado}</h3>
                    <span style="font-size: 12px; color: var(--gray-500);">${n.numero_nota || 'Sem número'}</span>
                </div>
                <div class="card-body">
                    <p><strong>Cliente:</strong> ${n.clientes?.nome || 'Não informado'}</p>
                    <p><strong>Valor:</strong> R$ ${n.valor.toFixed(2)}</p>
                    ${n.arquivo_url ? '<p>📎 Com arquivo anexado</p>' : ''}
                </div>
            </div>
        `).join('');
    }
}