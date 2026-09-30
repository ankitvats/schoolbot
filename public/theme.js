// Loaded in <head> so the saved or system theme applies before first paint.
(function () {
  const KEY = "schoolbot-theme";
  const COLORS = { light: "#efeee9", dark: "#17191e" };
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const saved = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };

  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", COLORS[theme]);
  };

  apply(saved() || (media.matches ? "dark" : "light"));

  // Follow the system until the user picks a theme themselves.
  media.addEventListener("change", (e) => {
    if (!saved()) apply(e.matches ? "dark" : "light");
  });

  window.toggleTheme = () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice still applies for this page.
    }
    apply(next);
    return next;
  };
})();
