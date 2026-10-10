import jaytech from "@/assets/jaytech.png";

export function JayBadge() {
  return (
    <a
      href="https://jaytech.online"
      target="_blank"
      rel="noreferrer"
      aria-label="Made by JayTech — visit JayTech"
      className="group fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-white/70 bg-slate-950/95 py-1.5 pl-1.5 pr-3 text-[11px] font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.28)] backdrop-blur transition duration-300 hover:border-blue-400 sm:bottom-6 sm:right-6 sm:pr-4 sm:text-xs"
    >
      <img
        src={jaytech}
        alt="JayTech"
        className="h-8 w-8 rounded-full border border-blue-400/80 object-cover transition duration-300 group-hover:rotate-6 group-hover:scale-110 sm:h-9 sm:w-9"
      />
      <span className="whitespace-nowrap">Made by JayTech</span>
    </a>
  );
}
