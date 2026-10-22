import { useState } from "react";
import skills from "./skills.json";
import "./asset-profile-panels.css";

type ProfileCharacter = {
  name: string;
  designation: string;
  cardImage: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
};

export function AssetSkills({ character }: { character: ProfileCharacter }) {
  const [selected, setSelected] = useState(skills[0].id);
  const current = skills.find(skill => skill.id === selected)!;
  return <div className="asset-skills">
    <div className="asset-skills__sidebar">
      <header className="asset-skills__character">
        <img src={character.cardImage} alt="" width="104" height="104" />
        <div><h2>{character.name}</h2><p>{character.designation}</p></div>
      </header>
      <div className="asset-skills__list" role="group" aria-label="Character skills">
        {skills.map((skill, index) => <button key={skill.id} type="button" className="asset-skills__option"
          aria-pressed={selected === skill.id} aria-label={skill.name} aria-controls="asset-skill-demonstration"
          title={skill.description} onClick={() => setSelected(skill.id)}>
          <span className="asset-skills__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <img src={skill.icon} alt="" width="40" height="40" />
          <span className="asset-skills__name">{skill.name}</span>
        </button>)}
      </div>
    </div>
    <section id="asset-skill-demonstration" className="asset-profile__empty" aria-label={`${current.name} demonstration`} />
  </div>;
}

export function AssetInfoMap({ character }: { character: ProfileCharacter }) {
  return <div className="asset-info-map">
    <div className="asset-info-map__identity">
      <div className="asset-info-map__portrait">
        <img src={character.image} alt={character.name} width={character.imageWidth} height={character.imageHeight} decoding="async" />
      </div>
      <div className="asset-info-map__rapport" aria-label="默契度，等级 1">
        <span lang="zh-CN">默契度</span><span className="asset-info-map__level">LV. 1</span>
      </div>
    </div>
    <section className="asset-profile__empty" aria-label={`${character.name} info map`} />
  </div>;
}
