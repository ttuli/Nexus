
const THEME_KEY = 'app_theme';

type Theme = 'light' | 'dark';

export const getTheme = (): Theme => {
    return (localStorage.getItem(THEME_KEY) as Theme) || 'light';
}

export const setTheme = (theme: Theme) => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
}

export const toggleTheme = () => {
    const current = getTheme();
    const next = current === 'light' ? 'dark' : 'light';
    setTheme(next);
    return next;
}

export const initTheme = () => {
    const theme = getTheme();
    document.documentElement.setAttribute('data-theme', theme);
}
