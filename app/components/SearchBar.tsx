"use client";

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { Search, Loader2 } from "lucide-react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
  value?: string;
  isLoading?: boolean;
  suggestions?: Array<{ name: string; body: string; category: string }>;
  onSuggestionSelect?: (suggestion: { name: string; body: string; category: string }) => void;
  showNotFound?: boolean;
  notFoundMessage?: string;
  onDismissNotFound?: () => void;
}

export default function SearchBar({
  onSearch,
  placeholder = "Search planetary features, locations, coordinates...",
  className = "",
  value: externalValue,
  isLoading = false,
  suggestions = [],
  onSuggestionSelect,
  showNotFound = false,
  notFoundMessage,
  onDismissNotFound,
}: SearchBarProps) {
  const [query, setQuery] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    if (externalValue !== undefined) {
      setQuery(externalValue);
    }
  }, [externalValue]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim());
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      onSuggestionSelect?.(suggestions[selectedIndex]);
      setSelectedIndex(-1);
    } else if (e.key === "Escape") {
      onDismissNotFound?.();
      setSelectedIndex(-1);
    }
  };

  return (
    <div className={`relative ${className}`} data-pe-searchbar>
      {/* Progress bar at top */}
      {isLoading && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 animate-[shimmer_1.5s_ease-in-out_infinite]" 
               style={{
                 background: 'linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.8), transparent)',
                 backgroundSize: '200% 100%',
                 animation: 'shimmer 1.5s ease-in-out infinite'
               }} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-bar flex items-center gap-3">
        <Search className="text-white/70 w-5 h-5 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="flex-grow bg-transparent outline-none text-white placeholder-white/50 text-base disabled:opacity-50"
        />
        {isLoading && <Loader2 className="w-5 h-5 text-white/70 animate-spin flex-shrink-0" />}
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="sr-only"
          aria-label="Search"
        >
          Search
        </button>
      </form>

      {showNotFound && (
        <div className="absolute top-full mt-2 w-full glass-card">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="text-white/90 font-medium mb-1">No exact match found</div>
              {notFoundMessage && <p className="text-white/60 text-sm">{notFoundMessage}</p>}
            </div>
            <button
              onClick={onDismissNotFound}
              className="text-white/60 hover:text-white transition-colors text-xl leading-none"
              title="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="absolute top-full mt-2 w-full glass-card">
          <div className="text-white/60 text-sm mb-2">Did you mean:</div>
          <div className="space-y-1">
            {suggestions.slice(0, 6).map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionSelect?.(suggestion)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedIndex === idx
                    ? "bg-white/20 text-white"
                    : "bg-white/5 hover:bg-white/10 text-white/80"
                }`}
              >
                <div className="font-medium">{suggestion.name}</div>
                <div className="text-xs text-white/60 capitalize">
                  {suggestion.category} on {suggestion.body}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
