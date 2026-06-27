// modules/dashboard.js
import supabase from '../services/supabase.js';

export class Dashboard {
    constructor() {
        this.calendar = null;
        this.servicos = [];
        this.selectedDate = null;
        this.init();
    }

    async init() {
        await this.loadData();
        await this.initCalendar();
        this.setupEventListeners();
        this.setupCardNavigation();
    }

    // ============================================
    // CARREGAMENTO DE DADOS
    // ============================================
    async loadData() {
        try {
            console.log('📥 Carregando dados do dashboard...');

            const [
                clientes,
                servicos,
                servicosConcluidos,
                servicosPendentes,
                servicosCancelados,
                notas,
                servicosComValor
            ] = await Promise.all([
                supabase.from('clientes').select('*', { count: 'exact', head: true }),
                supabase.from('servicos').select('*', { count: 'exact', head: true }),
                supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('status', 'concluido'),
                supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
                supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('status', 'cancelado'),
                supabase.from('notas').select('*', { count: 'exact', head: true }),
                supabase.from('servicos').select('id, valor, status, pago, data, servico, cliente_id')
            ]);

            // Lógica financeira
            const valorRecebido = servicosComValor.data
                ?.filter(s => s.status === 'concluido' && s.pago === true)
                ?.reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

            const valorAReceber = servicosComValor.data
                ?.filter(s => s.status === 'concluido' && s.pago !== true)
                ?.reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

            this.servicos = servicosComValor.data || [];

            const { data: ultimosServicos } = await supabase
                .from('servicos')
                .select(`
                    *,
                    clientes:cliente_id(nome)
                `)
                .order('data', { ascending: false })
                .limit(5);

            const { data: ultimasNotas } = await supabase
                .from('notas')
                .select(`
                    *,
                    clientes:cliente_id(nome)
                `)
                .order('data_emissao', { ascending: false })
                .limit(5);

            this.updateStats({
                clientes: clientes.count || 0,
                servicos: servicos.count || 0,
                servicosConcluidos: servicosConcluidos.count || 0,
                servicosPendentes: servicosPendentes.count || 0,
                servicosCancelados: servicosCancelados.count || 0,
                notas: notas.count || 0,
                valorRecebido: valorRecebido,
                valorAReceber: valorAReceber
            });

            this.renderUltimosServicos(ultimosServicos || []);
            this.renderUltimasNotas(ultimasNotas || []);

            console.log('✅ Dashboard carregado com sucesso!', this.servicos.length, 'serviços');

        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
            this.showNotification('Erro ao carregar dados!', 'error');
        }
    }

    // ============================================
    // ATUALIZAÇÃO DE STATS
    // ============================================
    updateStats(data) {
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

        const colorMap = {
            valorRecebido: 'success',
            valorAReceber: 'warning',
            servicosCancelados: 'danger',
            servicosConcluidos: 'success',
            servicosPendentes: 'warning',
            totalClientes: 'primary'
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
                if (colorMap[id]) {
                    el.className = `stat-value ${colorMap[id]}`;
                }
            }
        });
    }

    // ============================================
    // NAVEGAÇÃO DOS CARDS
    // ============================================
    setupCardNavigation() {
        // Card "Clientes" → clientes.html
        const clientesCard = document.getElementById('totalClientes')?.closest('.stat-card');
        if (clientesCard) {
            clientesCard.style.cursor = 'pointer';
            clientesCard.addEventListener('click', () => {
                window.location.href = 'clientes.html';
            });
        }

        // Card "Total Serviços" → servicos.html
        const totalServicosCard = document.getElementById('totalServicos')?.closest('.stat-card');
        if (totalServicosCard) {
            totalServicosCard.style.cursor = 'pointer';
            totalServicosCard.addEventListener('click', () => {
                window.location.href = 'servicos.html';
            });
        }

        // Card "Concluídos" → servicos.html?status=concluido
        const concluidosCard = document.getElementById('servicosConcluidos')?.closest('.stat-card');
        if (concluidosCard) {
            concluidosCard.style.cursor = 'pointer';
            concluidosCard.addEventListener('click', () => {
                window.location.href = 'servicos.html?status=concluido';
            });
        }

        // Card "Pendentes" → servicos.html?status=pendente
        const pendentesCard = document.getElementById('servicosPendentes')?.closest('.stat-card');
        if (pendentesCard) {
            pendentesCard.style.cursor = 'pointer';
            pendentesCard.addEventListener('click', () => {
                window.location.href = 'servicos.html?status=pendente';
            });
        }

        // Card "Cancelados" → servicos.html?status=cancelado
        const canceladosCard = document.getElementById('servicosCancelados')?.closest('.stat-card');
        if (canceladosCard) {
            canceladosCard.style.cursor = 'pointer';
            canceladosCard.addEventListener('click', () => {
                window.location.href = 'servicos.html?status=cancelado';
            });
        }

        // Card "Notas Fiscais" → notas.html
        const notasCard = document.getElementById('totalNotas')?.closest('.stat-card');
        if (notasCard) {
            notasCard.style.cursor = 'pointer';
            notasCard.addEventListener('click', () => {
                window.location.href = 'notas.html';
            });
        }

        // Card "Valor Recebido" → economia.html?filtro=recebido
        const valorRecebidoCard = document.getElementById('valorRecebido')?.closest('.stat-card');
        if (valorRecebidoCard) {
            valorRecebidoCard.style.cursor = 'pointer';
            valorRecebidoCard.addEventListener('click', () => {
                window.location.href = 'economia.html?filtro=recebido';
            });
        }

        // Card "Valor a Receber" → economia.html?filtro=receber
        const valorAReceberCard = document.getElementById('valorAReceber')?.closest('.stat-card');
        if (valorAReceberCard) {
            valorAReceberCard.style.cursor = 'pointer';
            valorAReceberCard.addEventListener('click', () => {
                window.location.href = 'economia.html?filtro=receber';
            });
        }
    }

    // ============================================
    // RENDERIZAÇÃO DE LISTAS
    // ============================================
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

        container.innerHTML = servicos.map(s => {
            const isPago = s.pago === true;

            // ============================================
            // COR DO VALOR BASEADA NO STATUS DE PAGAMENTO
            // ============================================
            // Verde: pagamento realizado (pago)
            // Laranja: pagamento pendente (não pago)
            // Sem cor: sem valor definido ou serviço não concluído
            let valorColor = '';
            let valorClass = '';

            if (s.valor) {
                if (s.status === 'concluido') {
                    if (isPago) {
                        valorColor = '#4CAF50'; // Verde
                        valorClass = 'valor-pago';
                    } else {
                        valorColor = '#F57C00'; // Laranja
                        valorClass = 'valor-pendente';
                    }
                } else {
                    valorColor = 'var(--gray-500)'; // Cinza para pendentes/cancelados
                    valorClass = 'valor-normal';
                }
            }

            return `
            <div class="servico-item" onclick="window.dashboard?.goToServico('${s.id}')">
                <div class="servico-info">
                    <span class="servico-nome">${s.servico}</span>
                    <span class="servico-cliente">👤 ${s.clientes?.nome || 'Cliente não informado'}</span>
                </div>
                <div class="servico-meta">
                    ${s.valor ? `
                        <span class="servico-valor ${valorClass}" style="color: ${valorColor};">
                            R$ ${s.valor.toFixed(2)}
                            ${s.status === 'concluido' ? (isPago ? ' ✅' : ' ⏳') : ''}
                        </span>
                    ` : ''}
                    <span class="servico-status ${s.status}">${statusLabels[s.status] || s.status}</span>
                    ${s.status === 'concluido' ?
                    `<span class="payment-badge ${isPago ? 'pago' : 'nao-pago'}">${isPago ? '💰 Pago' : '⏳ A Pagar'}</span>` :
                    ''}
                    <span class="servico-data">📅 ${s.data}</span>
                </div>
            </div>
        `}).join('');
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

    // ============================================
    // CALENDÁRIO
    // ============================================
    getEvents() {
        console.log('📊 Gerando eventos para o calendário...');

        return this.servicos.map(s => {
            const statusColors = {
                'pendente': '#F57C00',
                'concluido': '#4CAF50',
                'cancelado': '#f44336'
            };

            return {
                id: String(s.id),
                title: s.servico || 'Serviço',
                start: s.data,
                extendedProps: {
                    ...s,
                    clienteNome: s.clientes?.nome || 'Cliente'
                },
                backgroundColor: statusColors[s.status] || '#B71C1C',
                borderColor: statusColors[s.status] || '#B71C1C',
                textColor: '#FFFFFF',
                classNames: ['fc-event-clickable']
            };
        });
    }

    async initCalendar() {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) {
            console.warn('⚠️ Elemento do calendário não encontrado');
            return;
        }

        if (typeof FullCalendar === 'undefined') {
            console.log('⏳ Aguardando FullCalendar carregar...');
            await new Promise(resolve => {
                const check = () => {
                    if (typeof FullCalendar !== 'undefined') {
                        resolve();
                    } else {
                        setTimeout(check, 100);
                    }
                };
                check();
            });
        }

        const events = this.getEvents();
        console.log('📊 Eventos gerados:', events.length);

        this.calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: false,
            events: events,
            editable: false,
            selectable: true,
            dayMaxEvents: 2,
            weekends: true,
            eventClick: this.handleEventClick.bind(this),
            dateClick: this.handleDateClick.bind(this),
            eventDidMount: this.handleEventMount.bind(this),
            dayCellDidMount: this.handleDayCellMount.bind(this),
            eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false
            },
            views: {
                dayGridMonth: {
                    dayMaxEvents: 3
                }
            }
        });

        this.calendar.render();
        this.updateCalendarTitle();

        const today = new Date();
        this.selectDate(today);
    }

    updateCalendarTitle() {
        if (!this.calendar) return;

        const view = this.calendar.view;
        const titleEl = document.getElementById('calendarTitle');
        if (!titleEl) return;

        if (view.type === 'dayGridMonth') {
            const date = view.activeStart;
            titleEl.textContent = date.toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric'
            });
        } else if (view.type === 'timeGridWeek') {
            const start = view.activeStart;
            const end = view.activeEnd;
            const startStr = start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            const endStr = end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
            titleEl.textContent = `${startStr} - ${endStr}`;
        } else if (view.type === 'timeGridDay') {
            const date = view.activeStart;
            titleEl.textContent = date.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        }
    }

    // ============================================
    // HANDLE EVENT CLICK
    // ============================================
    handleEventClick(info) {
        console.log('🖱️ Evento clicado:', info.event);

        let eventId = info.event.id;

        if (!eventId || eventId === 'undefined' || eventId === 'null' || eventId === '') {
            const props = info.event.extendedProps;
            if (props && props.id) {
                eventId = props.id;
            } else {
                console.error('❌ Não foi possível obter o ID do evento');
                this.showNotification('Erro ao carregar serviço!', 'error');
                return;
            }
        }

        eventId = String(eventId);

        if (!eventId || eventId === 'undefined' || eventId === 'null' || eventId === '') {
            console.error('❌ ID do evento inválido:', eventId);
            this.showNotification('Erro ao carregar serviço!', 'error');
            return;
        }

        console.log('📋 Redirecionando para serviço ID:', eventId);
        this.goToServico(eventId);
    }

    // ============================================
    // REDIRECIONAR PARA PÁGINA DE SERVIÇOS
    // ============================================
    goToServico(servicoId) {
        if (!servicoId || servicoId === 'undefined' || servicoId === 'null' || servicoId === '') {
            this.showNotification('ID do serviço inválido!', 'error');
            return;
        }

        console.log('🔗 Redirecionando para:', `servicos.html?id=${servicoId}`);
        window.location.href = `servicos.html?id=${servicoId}`;
    }

    handleDateClick(info) {
        this.selectDate(info.date);
    }

    handleEventMount(info) {
        const props = info.event.extendedProps;
        if (props) {
            const title = props.servico || 'Serviço';
            const cliente = props.clienteNome || 'Cliente';
            info.el.title = `${title} - ${cliente}`;
            info.el.style.cursor = 'pointer';
        }
    }

    handleDayCellMount(info) {
        const dateStr = info.date.toISOString().split('T')[0];
        const hasEvents = this.servicos.some(s => s.data === dateStr);
        if (hasEvents) {
            info.el.classList.add('has-events');
        }
    }

    selectDate(date) {
        this.selectedDate = date;
        const dateStr = date.toISOString().split('T')[0];

        const selectedDateEl = document.getElementById('selectedDate');
        if (selectedDateEl) {
            selectedDateEl.innerHTML = `<strong>${date.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            })}</strong>`;
        }

        const dayEvents = this.servicos.filter(s => s.data === dateStr);
        this.renderDayDetails(dayEvents, date);
    }

    renderDayDetails(events, date) {
        const container = document.getElementById('dayDetailsContent');
        if (!container) return;

        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-day">
                    <div class="empty-icon">📭</div>
                    <h4>Nenhum serviço neste dia</h4>
                    <p>Não há atividades registradas para ${date.toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'long'
            })}</p>
                </div>
            `;
            return;
        }

        const statusLabels = {
            'pendente': 'Pendente',
            'concluido': 'Concluído',
            'cancelado': 'Cancelado'
        };

        container.innerHTML = events.map(s => `
            <div class="day-event-item" onclick="window.dashboard?.goToServico('${s.id}')">
                <div class="event-header">
                    <span class="event-title">${s.servico || 'Serviço'}</span>
                    <span class="event-status ${s.status}">${statusLabels[s.status] || s.status}</span>
                </div>
                <div class="event-body">
                    <span class="event-info">
                        <i data-lucide="user"></i>
                        ${s.clientes?.nome || 'Cliente não informado'}
                    </span>
                    ${s.valor ? `
                        <span class="event-info event-valor" style="color: ${s.status === 'concluido' ? (s.pago ? '#4CAF50' : '#F57C00') : 'var(--gray-500)'}; font-weight: 600;">
                            <i data-lucide="dollar-sign"></i>
                            R$ ${s.valor.toFixed(2)}
                            ${s.status === 'concluido' ? (s.pago ? ' ✅' : ' ⏳') : ''}
                        </span>
                    ` : ''}
                    ${s.pago !== undefined && s.status === 'concluido' ? `
                        <span class="event-info">
                            <i data-lucide="${s.pago ? 'check-circle' : 'clock'}"></i>
                            ${s.pago ? '✅ Pago' : '⏳ Aguardando pagamento'}
                        </span>
                    ` : ''}
                </div>
            </div>
        `).join('');

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        document.getElementById('prevBtn')?.addEventListener('click', () => {
            if (this.calendar) {
                this.calendar.prev();
                this.updateCalendarTitle();
            }
        });

        document.getElementById('nextBtn')?.addEventListener('click', () => {
            if (this.calendar) {
                this.calendar.next();
                this.updateCalendarTitle();
            }
        });

        document.getElementById('todayBtn')?.addEventListener('click', () => {
            if (this.calendar) {
                this.calendar.today();
                this.updateCalendarTitle();
                this.selectDate(new Date());
            }
        });

        document.querySelectorAll('.view-buttons button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-buttons button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.calendar) {
                    this.calendar.changeView(btn.dataset.view);
                    this.updateCalendarTitle();
                }
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('eventModal');
                if (modal) modal.style.display = 'none';
            }
        });
    }

    // ============================================
    // NOTIFICAÇÕES
    // ============================================
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

// Tornar disponível globalmente
window.dashboard = null;

document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});