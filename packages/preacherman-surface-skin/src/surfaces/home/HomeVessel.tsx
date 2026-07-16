import mainHuman from "../../assets/figma/home-batch-1/281-374--state-vessel-translucent-human-figure.png";
import mainOrbitSlow from "../../assets/figma/home-batch-1/281-374--state-vessel-orbit-line-slow-rotation.svg";
import mainOrbitSecondary from "../../assets/figma/home-batch-1/281-374--state-vessel-secondary-orbit-line.svg";
import mainHaloMemory from "../../assets/figma/home-batch-1/281-374--state-vessel-skill-halo-memory-core.svg";
import mainHaloSkill from "../../assets/figma/home-batch-1/281-374--state-vessel-skill-halo-code-copilot.svg";
import chatHuman from "../../assets/figma/home-batch-1/32-2--state-vessel-translucent-human-figure.png";
import replyHuman from "../../assets/figma/home-batch-1/412-728--state-vessel-translucent-human-figure.png";
import chatOrbitSlow from "../../assets/figma/home-batch-1/32-2--state-vessel-orbit-line-slow-rotation.svg";
import chatOrbitSecondary from "../../assets/figma/home-batch-1/32-2--state-vessel-secondary-orbit-line.svg";
import chatHaloMemory from "../../assets/figma/home-batch-1/32-2--state-vessel-skill-halo-memory-core.svg";
import chatHaloSkill from "../../assets/figma/home-batch-1/32-2--state-vessel-skill-halo-code-copilot.svg";
import replyHaloMemory from "../../assets/figma/home-batch-1/412-728--state-vessel-skill-halo-memory-core.svg";

interface HomeVesselProps {
  readonly layout?: "home" | "chat" | "reply";
}

const haloPositions = {
  home: [[478, 334], [620, 510], [874, 265], [891, 434]],
  chat: [[173, 322], [323, 517], [580, 244], [611, 426]],
  reply: [[190, 337], [272, 505], [560, 205], [612, 402]],
} as const;

export function HomeVessel({ layout = "home" }: HomeVesselProps) {
  const isChat = layout !== "home";
  const human = layout === "reply" ? replyHuman : isChat ? chatHuman : mainHuman;
  const memoryHalo = layout === "reply" ? replyHaloMemory : isChat ? chatHaloMemory : mainHaloMemory;
  const skillHalo = isChat ? chatHaloSkill : mainHaloSkill;
  const positions = haloPositions[layout];

  return (
    <div aria-hidden="true" className={`pm-home-vessel pm-home-vessel--${layout}`}>
      <img alt="" className="pm-home-vessel__orbit pm-home-vessel__orbit--slow" src={isChat ? chatOrbitSlow : mainOrbitSlow} />
      <img alt="" className="pm-home-vessel__orbit pm-home-vessel__orbit--secondary" src={isChat ? chatOrbitSecondary : mainOrbitSecondary} />
      <img alt="" className="pm-home-vessel__human" src={human} />
      {positions.map(([left, top], index) => (
        <img
          alt=""
          className="pm-home-vessel__halo"
          key={`${left}-${top}`}
          src={index === 0 ? memoryHalo : skillHalo}
          style={{ left, top }}
        />
      ))}
    </div>
  );
}
