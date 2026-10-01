const nav = document.querySelector(".nav");
const reveals = document.querySelectorAll(".reveal");

const updateNav = () => nav.classList.toggle("scrolled", window.scrollY > 24);
window.addEventListener("scroll", updateNav, { passive: true });
updateNav();

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

reveals.forEach(element => observer.observe(element));

