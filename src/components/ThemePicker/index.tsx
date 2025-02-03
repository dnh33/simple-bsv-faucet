import { useState, useRef, useEffect } from "react";
import "./ThemePicker.css";

type Theme = "aqua" | "rainbow" | "accessibility";

interface ThemePickerProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
}

const THEME_LABELS: Record<Theme, { icon: string; label: string }> = {
  aqua: { icon: "🌊", label: "Aqua" },
  rainbow: { icon: "🌈", label: "Rainbow" },
  accessibility: { icon: "♿", label: "High Contrast" },
};

export function ThemePicker({ currentTheme, onThemeChange }: ThemePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="theme-picker" ref={dropdownRef}>
      <button
        className="theme-picker-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {THEME_LABELS[currentTheme].icon} Theme
        <span className="dropdown-arrow">▼</span>
      </button>

      {isOpen && (
        <div className="theme-dropdown">
          {(
            Object.entries(THEME_LABELS) as [
              Theme,
              { icon: string; label: string }
            ][]
          ).map(([theme, { icon, label }]) => (
            <button
              key={theme}
              className={`theme-option ${
                theme === currentTheme ? "active" : ""
              }`}
              onClick={() => {
                onThemeChange(theme);
                setIsOpen(false);
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
