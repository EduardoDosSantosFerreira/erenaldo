// modules/dashboard.js
import supabase from '../services/supabase.js';

export class Dashboard {
    constructor() {
        this.servicos = [];
        this.currentDate = new Date();
        this.selectedDate = null;
        this.isExpanded = false;
        this.init();
    }

    async init() {
        await this.loadData();
        this.renderCalendar();
        this.setupEventListeners();
        this.setupCardNavigation();
        this.setupExpandButtons();
        this.setupDayModal();
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
                supabase.from('servicos').select(`
                    *,
                    clientes:cliente_id(id, nome, telefone, email)
                `)
            ]);

            const valorRecebido = servicosComValor.data
                ?.filter(s => s.status === 'concluido' && s.pago === true)
                ?.reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

            const valorAReceber = servicosComValor.data
                ?.filter(s => s.status === 'concluido' && s.pago !== true)
                ?.reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

            const totalGeral = valorRecebido + valorAReceber;
            const percentualRecebido = totalGeral > 0 ? (valorRecebido / totalGeral) * 100 : 0;

            this.servicos = servicosComValor.data || [];

            this.updateStats({
                clientes: clientes.count || 0,
                servicos: servicos.count || 0,
                servicosConcluidos: servicosConcluidos.count || 0,
                servicosPendentes: servicosPendentes.count || 0,
                servicosCancelados: servicosCancelados.count || 0,
                notas: notas.count || 0,
                valorRecebido,
                valorAReceber
            });

            document.getElementById('resumoRecebido').textContent = `R$ ${valorRecebido.toFixed(2)}`;
            document.getElementById('resumoAReceber').textContent = `R$ ${valorAReceber.toFixed(2)}`;
            document.getElementById('resumoTotal').textContent = `R$ ${totalGeral.toFixed(2)}`;
            document.getElementById('resumoPercentual').textContent = `${percentualRecebido.toFixed(1)}%`;

            this.renderUltimosServicos(servicosComValor.data || []);
            this.renderProximosServicos(servicosComValor.data || []);
            this.renderTimeline();

            const hoje = new Date();
            this.selectedDate = hoje;

            const loading = document.getElementById('loadingDashboard');
            const data = document.getElementById('dashboardData');
            if (loading) loading.style.display = 'none';
            if (data) data.style.display = 'block';

            console.log('✅ Dashboard carregado com sucesso!');

        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
            this.showNotification('Erro ao carregar dados!', 'error');
        }
    }

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

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    setupCardNavigation() {
        document.querySelectorAll('.card-indicator').forEach(card => {
            card.addEventListener('click', () => {
                const url = card.dataset.url;
                if (url) window.location.href = url;
            });
        });
    }

    renderUltimosServicos(servicos) {
        const container = document.getElementById('ultimosServicos');
        if (!container) return;

        const ultimos = servicos
            .sort((a, b) => new Date(b.data) - new Date(a.data))
            .slice(0, 5);

        if (ultimos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="inbox"></i>
                    <p>Nenhum serviço registrado</p>
                </div>
            `;
            return;
        }

        const statusLabels = {
            'pendente': 'Pendente',
            'concluido': 'Concluído',
            'cancelado': 'Cancelado'
        };

        container.innerHTML = ultimos.map(s => {
            const isPago = s.pago === true;
            const valorClass = (s.status === 'concluido' && isPago) ? 'pago' : 'pendente';
            
            return `
            <div class="servico-item" onclick="window.dashboard?.goToServico('${s.id}')">
                <div class="servico-info">
                    <span class="servico-nome">${s.servico}</span>
                    <span class="servico-cliente">👤 ${s.clientes?.nome || 'Cliente não informado'}</span>
                </div>
                <div class="servico-meta">
                    ${s.valor ? `<span class="servico-valor ${valorClass}">R$ ${s.valor.toFixed(2)}</span>` : ''}
                    <span class="servico-status ${s.status}">${statusLabels[s.status] || s.status}</span>
                    <span class="servico-data">📅 ${s.data}</span>
                </div>
            </div>
        `}).join('');
    }

    // ============================================
    // PRÓXIMOS SERVIÇOS - CORRIGIDO
    // Mostra TODOS os serviços PENDENTES
    // Ordenados por DATA (mais antigos primeiro = URGÊNCIA)
    // ============================================
    renderProximosServicos(servicos) {
        const container = document.getElementById('proximosServicos');
        if (!container) return;

        // Filtra APENAS serviços com status 'pendente'
        const pendentes = servicos.filter(s => s.status === 'pendente');

        // Ordena por data (mais antigos primeiro - URGÊNCIA)
        const ordenadosPorUrgencia = pendentes.sort((a, b) => {
            return new Date(a.data) - new Date(b.data);
        });

        // Pega todos os pendentes (sem limite)
        const proximos = ordenadosPorUrgencia;

        if (proximos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="check-circle" style="color: #4CAF50;"></i>
                    <p style="color: #4CAF50; font-weight: 500;">✅ Nenhum serviço pendente!</p>
                    <p style="font-size: 11px; color: var(--gray-400);">Todos os serviços estão em dia</p>
                </div>
            `;
            return;
        }

        // Adiciona um badge de contagem
        const countBadge = `<span class="badge-count">${proximos.length} pendente${proximos.length > 1 ? 's' : ''}</span>`;

        // Atualiza o header com a contagem
        const listHeader = container.closest('.servicos-list-full')?.querySelector('.list-header');
        if (listHeader) {
            const h3 = listHeader.querySelector('h3');
            if (h3) {
                // Remove badge antigo se existir
                const oldBadge = h3.querySelector('.badge-count');
                if (oldBadge) oldBadge.remove();
                h3.innerHTML = `<i data-lucide="alert-circle"></i> Serviços Pendentes ${countBadge}`;
                if (window.lucide) lucide.createIcons();
            }
        }

        const hoje = new Date();

        container.innerHTML = proximos.map(s => {
            // Calcula dias em atraso
            const dataServico = new Date(s.data);
            const diffTime = hoje - dataServico;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Determina nível de urgência
            let urgenciaClass = '';
            let urgenciaLabel = '';
            if (diffDays > 30) {
                urgenciaClass = 'urgencia-critica';
                urgenciaLabel = '🔴 Crítico';
            } else if (diffDays > 15) {
                urgenciaClass = 'urgencia-alta';
                urgenciaLabel = '🟠 Alta';
            } else if (diffDays > 7) {
                urgenciaClass = 'urgencia-media';
                urgenciaLabel = '🟡 Média';
            } else if (diffDays > 0) {
                urgenciaClass = 'urgencia-baixa';
                urgenciaLabel = '🟢 Baixa';
            } else {
                urgenciaClass = 'urgencia-hoje';
                urgenciaLabel = '📌 Hoje';
            }

            // Se for hoje ou futuro
            const diasTexto = diffDays > 0 ? `${diffDays} dias` : diffDays === 0 ? 'Hoje' : `${Math.abs(diffDays)} dias`;

            return `
            <div class="servico-item ${urgenciaClass}" onclick="window.dashboard?.goToServico('${s.id}')">
                <div class="servico-info">
                    <span class="servico-nome">${s.servico}</span>
                    <span class="servico-cliente">👤 ${s.clientes?.nome || 'Cliente não informado'}</span>
                </div>
                <div class="servico-meta">
                    <span class="servico-urgencia ${urgenciaClass}">${urgenciaLabel}</span>
                    <span class="servico-data">📅 ${s.data}</span>
                    <span class="servico-dias">⏱️ ${diasTexto}</span>
                </div>
            </div>
        `}).join('');
    }

    renderTimeline() {
        const container = document.getElementById('timelineContent');
        if (!container) return;

        const eventos = [];

        this.servicos.forEach(s => {
            eventos.push({
                data: s.created_at || s.data,
                descricao: `Serviço "${s.servico}" criado para ${s.clientes?.nome || 'cliente'}`,
                link: `servicos.html?id=${s.id}`,
                icone: 'briefcase',
                cor: 'blue'
            });

            if (s.status === 'concluido') {
                eventos.push({
                    data: s.updated_at || s.data,
                    descricao: `Serviço "${s.servico}" concluído para ${s.clientes?.nome || 'cliente'}`,
                    link: `servicos.html?id=${s.id}`,
                    icone: 'check-circle',
                    cor: 'green'
                });
            }

            if (s.pago === true && s.status === 'concluido') {
                eventos.push({
                    data: s.updated_at || s.data,
                    descricao: `Pagamento de R$ ${(s.valor || 0).toFixed(2)} recebido de ${s.clientes?.nome || 'cliente'}`,
                    link: `servicos.html?id=${s.id}`,
                    icone: 'dollar-sign',
                    cor: 'green'
                });
            }
        });

        eventos.sort((a, b) => new Date(b.data) - new Date(a.data));
        const recentes = eventos.slice(0, 10);

        if (recentes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="inbox"></i>
                    <p>Nenhuma atividade recente</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recentes.map(e => `
            <div class="timeline-item">
                <div class="timeline-icon ${e.cor}">
                    <i data-lucide="${e.icone}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-text">${e.descricao}</div>
                    <div class="timeline-time">${this.formatarData(e.data)}</div>
                    <a href="${e.link}" class="timeline-link">Ver detalhes</a>
                </div>
            </div>
        `).join('');

        if (window.lucide) lucide.createIcons();
    }

    formatarData(data) {
        if (!data) return 'Data desconhecida';
        const date = new Date(data);
        const now = new Date();
        const diff = Math.floor((now - date) / (1000 * 60));

        if (diff < 1) return 'Agora mesmo';
        if (diff < 60) return `${diff} min atrás`;
        if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`;
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    goToServico(servicoId) {
        if (!servicoId) return;
        window.location.href = `servicos.html?id=${servicoId}`;
    }

    // ============================================
    // CALENDÁRIO - RENDERIZAÇÃO
    // ============================================
    
    renderCalendar(targetId = 'calendarGrid', titleId = 'calendarTitle', badgeId = 'eventCountBadge') {
        const container = document.getElementById(targetId);
        if (!container) return;

        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const titleEl = document.getElementById(titleId);
        if (titleEl) {
            titleEl.textContent = `${monthNames[month]} ${year}`;
        }

        const monthEvents = this.servicos.filter(s => {
            const d = new Date(s.data);
            return d.getMonth() === month && d.getFullYear() === year;
        });
        const badge = document.getElementById(badgeId);
        if (badge) {
            const count = monthEvents.length;
            badge.textContent = `${count} evento${count !== 1 ? 's' : ''}`;
            badge.className = 'event-count-badge' + (count === 0 ? ' empty' : '');
        }

        const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        
        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDayOfWeek = firstDay.getDay();

        let html = '<div class="calendar-grid">';

        weekDays.forEach(day => {
            html += `<div class="calendar-weekday">${day}</div>`;
        });

        for (let i = 0; i < startDayOfWeek; i++) {
            html += `<div class="calendar-day empty"></div>`;
        }

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(year, month, day);
            const dateStr = dateObj.toISOString().split('T')[0];
            const isToday = dateStr === todayStr;
            
            const dayEvents = this.servicos.filter(s => s.data === dateStr);
            const hasEvents = dayEvents.length > 0;

            let classes = 'calendar-day';
            if (isToday) classes += ' today';
            if (hasEvents) classes += ' has-events';

            html += `<div class="${classes}" data-date="${dateStr}">`;
            html += `<div class="day-number">${day}</div>`;

            if (hasEvents) {
                html += `<div class="day-events">`;
                const displayEvents = dayEvents.slice(0, 3);
                displayEvents.forEach(e => {
                    const statusClass = e.status || 'pendente';
                    const fullTitle = `${e.servico} - ${e.clientes?.nome || ''}`;
                    html += `<div class="day-event ${statusClass}" data-id="${e.id}" title="${fullTitle}">${e.servico}</div>`;
                });
                if (dayEvents.length > 3) {
                    html += `<div class="day-more">+${dayEvents.length - 3} mais</div>`;
                }
                html += `</div>`;
            }

            html += `</div>`;
        }

        const totalCells = startDayOfWeek + daysInMonth;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < remainingCells; i++) {
            html += `<div class="calendar-day empty"></div>`;
        }

        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.calendar-day:not(.empty)').forEach(dayEl => {
            dayEl.addEventListener('click', () => {
                const dateStr = dayEl.dataset.date;
                if (dateStr) {
                    const date = new Date(dateStr + 'T00:00:00');
                    this.selectedDate = date;
                    this.openDayModal(date);
                }
            });
        });

        container.querySelectorAll('.day-event').forEach(eventEl => {
            eventEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = eventEl.dataset.id;
                if (id) this.goToServico(id);
            });
        });

        container.querySelectorAll('.day-more').forEach(moreEl => {
            moreEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const dayEl = moreEl.closest('.calendar-day');
                if (dayEl) {
                    const dateStr = dayEl.dataset.date;
                    if (dateStr) {
                        const date = new Date(dateStr + 'T00:00:00');
                        this.selectedDate = date;
                        this.openDayModal(date);
                    }
                }
            });
        });

        if (window.lucide) lucide.createIcons();
    }

    // ============================================
    // MODAL DE ATIVIDADES DO DIA
    // ============================================
    setupDayModal() {
        const overlay = document.getElementById('dayModalOverlay');
        const closeBtn = document.getElementById('dayModalClose');

        closeBtn?.addEventListener('click', () => {
            this.closeDayModal();
        });

        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeDayModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay?.classList.contains('active')) {
                this.closeDayModal();
            }
        });
    }

    openDayModal(date) {
        const overlay = document.getElementById('dayModalOverlay');
        const body = document.getElementById('dayModalBody');
        const title = document.getElementById('dayModalTitle');

        if (!overlay || !body) return;

        const dateStr = date.toISOString().split('T')[0];
        const dayEvents = this.servicos.filter(s => s.data === dateStr);

        const dayName = date.toLocaleDateString('pt-BR', { weekday: 'long' });
        const day = date.getDate();
        const month = date.toLocaleDateString('pt-BR', { month: 'long' });
        const year = date.getFullYear();
        const formattedDate = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${day} de ${month} de ${year}`;
        
        title.innerHTML = `
            Atividades do Dia
            <span class="day-date-highlight">— ${formattedDate}</span>
        `;

        const total = dayEvents.length;
        const pendentes = dayEvents.filter(s => s.status === 'pendente').length;
        const concluidos = dayEvents.filter(s => s.status === 'concluido').length;
        const cancelados = dayEvents.filter(s => s.status === 'cancelado').length;

        let statsHtml = `
            <div class="day-modal-stats">
                <div class="day-modal-stat">
                    <span class="stat-number total">${total}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="day-modal-stat">
                    <span class="stat-number pendente">${pendentes}</span>
                    <span class="stat-label">Pendentes</span>
                </div>
                <div class="day-modal-stat">
                    <span class="stat-number concluido">${concluidos}</span>
                    <span class="stat-label">Concluídos</span>
                </div>
            </div>
        `;

        let contentHtml = '';

        if (dayEvents.length === 0) {
            contentHtml = `
                <div class="empty-day">
                    <span class="empty-icon">📭</span>
                    <h4>Nenhum serviço neste dia</h4>
                    <p>Não há atividades registradas para ${date.toLocaleDateString('pt-BR', {
                        day: 'numeric',
                        month: 'long'
                    })}</p>
                </div>
            `;
        } else {
            const statusLabels = {
                'pendente': 'Pendente',
                'concluido': 'Concluído',
                'cancelado': 'Cancelado'
            };

            contentHtml = dayEvents.map(s => `
                <div class="day-event-item" onclick="window.dashboard?.goToServico('${s.id}')">
                    <div class="event-header">
                        <span class="event-title">${s.servico}</span>
                        <span class="event-status ${s.status}">${statusLabels[s.status] || s.status}</span>
                    </div>
                    <div class="event-body">
                        <span class="event-info">
                            <i data-lucide="user"></i>
                            <strong class="cliente-nome">${s.clientes?.nome || 'Cliente não informado'}</strong>
                        </span>
                        ${s.hora ? `<span class="event-info event-hora"><i data-lucide="clock"></i> ${s.hora}</span>` : ''}
                        ${s.valor ? `<span class="event-info event-valor">R$ ${s.valor.toFixed(2)}</span>` : ''}
                        ${s.pago === true ? '<span class="event-info" style="color: #4CAF50;">✅ Pago</span>' : ''}
                        ${s.pago === false && s.status === 'concluido' ? '<span class="event-info" style="color: #F57C00;">⏳ Pendente</span>' : ''}
                    </div>
                </div>
            `).join('');
        }

        body.innerHTML = statsHtml + contentHtml;

        if (window.lucide) lucide.createIcons();

        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeDayModal() {
        const overlay = document.getElementById('dayModalOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // ============================================
    // EXPANSÃO DO CALENDÁRIO
    // ============================================
    setupExpandButtons() {
        const expandBtn = document.getElementById('expandCalendarBtn');
        const closeBtn = document.getElementById('closeExpandBtn');
        const overlay = document.getElementById('calendarOverlay');

        expandBtn?.addEventListener('click', () => {
            this.isExpanded = true;
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            this.renderCalendar('overlayCalendarGrid', 'overlayTitle', 'overlayEventCount');
            
            if (this.selectedDate) {
                const dateStr = this.selectedDate.toISOString().split('T')[0];
                document.querySelectorAll('#overlayCalendarGrid .calendar-day:not(.empty)').forEach(el => {
                    if (el.dataset.date === dateStr) {
                        el.classList.add('selected');
                    }
                });
            }
        });

        const closeOverlay = () => {
            this.isExpanded = false;
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        };

        closeBtn?.addEventListener('click', closeOverlay);
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeOverlay();
            }
        });

        document.getElementById('overlayPrevBtn')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.renderCalendar('overlayCalendarGrid', 'overlayTitle', 'overlayEventCount');
            this.renderCalendar('calendarGrid', 'calendarTitle', 'eventCountBadge');
            if (this.selectedDate) {
                const newDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), this.selectedDate.getDate());
                if (newDate.getMonth() === this.currentDate.getMonth()) {
                    this.selectedDate = newDate;
                }
            }
        });

        document.getElementById('overlayNextBtn')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.renderCalendar('overlayCalendarGrid', 'overlayTitle', 'overlayEventCount');
            this.renderCalendar('calendarGrid', 'calendarTitle', 'eventCountBadge');
            if (this.selectedDate) {
                const newDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), this.selectedDate.getDate());
                if (newDate.getMonth() === this.currentDate.getMonth()) {
                    this.selectedDate = newDate;
                }
            }
        });

        document.getElementById('overlayTodayBtn')?.addEventListener('click', () => {
            const today = new Date();
            this.currentDate = new Date(today.getFullYear(), today.getMonth(), 1);
            this.renderCalendar('overlayCalendarGrid', 'overlayTitle', 'overlayEventCount');
            this.renderCalendar('calendarGrid', 'calendarTitle', 'eventCountBadge');
            this.selectedDate = today;
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isExpanded) {
                closeOverlay();
            }
        });
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.renderCalendar('calendarGrid', 'calendarTitle', 'eventCountBadge');
            if (this.selectedDate) {
                const newDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), this.selectedDate.getDate());
                if (newDate.getMonth() === this.currentDate.getMonth()) {
                    this.selectedDate = newDate;
                }
            }
        });

        document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.renderCalendar('calendarGrid', 'calendarTitle', 'eventCountBadge');
            if (this.selectedDate) {
                const newDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), this.selectedDate.getDate());
                if (newDate.getMonth() === this.currentDate.getMonth()) {
                    this.selectedDate = newDate;
                }
            }
        });

        document.getElementById('todayBtn')?.addEventListener('click', () => {
            const today = new Date();
            this.currentDate = new Date(today.getFullYear(), today.getMonth(), 1);
            this.renderCalendar('calendarGrid', 'calendarTitle', 'eventCountBadge');
            this.selectedDate = today;
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

// Inicializar
window.dashboard = null;

document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});