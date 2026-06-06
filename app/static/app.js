// Toggle del menú en mobile
(function () {
  const btn = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (btn && links) {
    btn.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => links.classList.remove("open"))
    );
  }
})();
