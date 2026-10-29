(() => {
  "use strict";
  const splash = document.querySelector("#bootIntro");
  const nav = document.querySelector("#mainNav");
  const toggle = document.querySelector("#menuToggle");
  const header = document.querySelector("#siteHeader");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (splash) {
    let seen = false;
    try { seen = sessionStorage.getItem("bekiuz-build-intro-seen") === "yes"; } catch {}
    if (seen || reduceMotion) {
      splash.classList.add("is-hidden");
    } else {
      window.setTimeout(() => {
        splash.classList.add("is-hidden");
        try { sessionStorage.setItem("bekiuz-build-intro-seen", "yes"); } catch {}
      }, 1350);
    }
  }

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Menyuni yopish" : "Menyuni ochish");
    });
    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }));
    document.addEventListener("click", (event) => {
      if (!nav.contains(event.target) && !toggle.contains(event.target)) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 8);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();