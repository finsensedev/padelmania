import { Sun, Moon } from 'lucide-react';
import { useTheme } from 'src/contexts/useTheme';

export default function ThemeToggle(){
  const { theme, toggle } = useTheme();
  return (
    <button aria-label="Toggle theme" onClick={toggle} className="p-2 rounded-lg border bg-card hover:bg-accent transition-colors">
      {theme==='light'? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
    </button>
  );
}
