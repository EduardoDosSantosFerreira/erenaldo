// modules/auth.js
import supabase from '../services/supabase.js';

export class AuthService {
    static async login(email, password) {
        try {
            console.log('🔐 Tentando login com:', email);
            
            // 1. Autenticar no Supabase
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim()
            });

            if (authError) {
                console.error('❌ Erro de autenticação:', authError);
                throw new Error(authError.message || 'Email ou senha incorretos');
            }

            if (!authData.user) {
                throw new Error('Usuário não encontrado');
            }

            console.log('✅ Usuário autenticado:', authData.user.id);

            // 2. Buscar ou criar perfil
            let userData = null;

            try {
                const { data, error } = await supabase
                    .from('usuarios')
                    .select('*')
                    .eq('id', authData.user.id)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    throw error;
                }
                userData = data;
            } catch (e) {
                console.log('⚠️ Erro ao buscar perfil:', e);
            }

            // 3. Se não encontrou, criar
            if (!userData) {
                console.log('📝 Criando perfil para:', authData.user.email);
                
                const nome = authData.user.user_metadata?.nome || 
                             authData.user.email.split('@')[0] || 
                             'Usuário';
                
                const perfil = authData.user.user_metadata?.perfil || 'tecnico';

                const { data: newUser, error: createError } = await supabase
                    .from('usuarios')
                    .upsert([{
                        id: authData.user.id,
                        email: authData.user.email,
                        nome: nome,
                        perfil: perfil
                    }], { onConflict: 'id' })
                    .select()
                    .single();

                if (createError) {
                    console.error('❌ Erro ao criar perfil:', createError);
                    throw new Error('Erro ao criar perfil do usuário');
                }

                userData = newUser;
            }

            // 4. Salvar sessão
            const sessionData = {
                user: userData,
                session: authData.session,
                timestamp: Date.now()
            };
            
            localStorage.setItem('erenaldo_user', JSON.stringify(sessionData));

            console.log('✅ Login bem-sucedido!', userData.nome);
            return { user: userData, session: authData.session };

        } catch (error) {
            console.error('❌ Erro no login:', error);
            throw error;
        }
    }

    static async logout() {
        try {
            await supabase.auth.signOut();
            localStorage.removeItem('erenaldo_user');
            window.location.href = '/login.html';
        } catch (error) {
            console.error('❌ Erro no logout:', error);
            throw error;
        }
    }

    static async getCurrentUser() {
        try {
            const cached = localStorage.getItem('erenaldo_user');
            if (cached) {
                try {
                    const data = JSON.parse(cached);
                    if (data.timestamp && (Date.now() - data.timestamp) < 86400000) {
                        return data.user;
                    }
                } catch (e) {}
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;

            const { data: profile } = await supabase
                .from('usuarios')
                .select('*')
                .eq('id', user.id)
                .single();

            if (!profile) return null;

            localStorage.setItem('erenaldo_user', JSON.stringify({
                user: profile,
                timestamp: Date.now()
            }));

            return profile;
        } catch (error) {
            console.error('❌ Erro:', error);
            return null;
        }
    }

    static async checkAuth() {
        const user = await this.getCurrentUser();
        const isLoginPage = window.location.pathname.includes('login.html') || 
                           window.location.pathname.includes('register.html');
        
        if (!user && !isLoginPage) {
            window.location.href = '/login.html';
            return null;
        }
        
        if (user && isLoginPage) {
            window.location.href = '/dashboard.html';
            return null;
        }
        
        return user;
    }
}