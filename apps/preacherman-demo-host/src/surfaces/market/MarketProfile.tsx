import { useEffect, useRef } from "react";
import "./market-profile.css";

/** Task's existing brand, profile copy and links; no second Gallery rendering runtime. */
export function MarketProfile({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <div className="market-profile" data-open={open}>
      <button ref={toggleRef} type="button" className="market-profile__toggle" aria-expanded={open}
        aria-controls="market-profile-content" onClick={() => onOpenChange(!open)}>
        {open ? "关闭" : "Preacherman"}
      </button>
      <div className="market-profile__backdrop" hidden={!open} onClick={() => {
        onOpenChange(false);
        toggleRef.current?.focus();
      }}>
        <section id="market-profile-content" className="market-profile__content" role="region"
          aria-label="Preacherman profile" onClick={event => event.stopPropagation()}>
          <p>
            <span>一个智能容器</span>
            <span>Preacherman 统一管理虚拟人物资产，兼容通用引擎、真实工具完成任务。</span>
            <span>在这里管理一位能持续学习、可部署、真正做事的人工智能。</span>
            <span>信任你在虚拟世界里的第二身份</span>
          </p>
          <ul aria-label="Preacherman links">
            <li><a href="https://www.instagram.com/jesperlandberg222/" rel="noopener" target="_blank">Instagram</a></li>
            <li><a href="https://www.linkedin.com/in/jesper-landberg-ba2984256/" rel="noopener" target="_blank">LinkedIn</a></li>
            <li><a href="mailto:jesper@alpacka.studio">邮件</a></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
