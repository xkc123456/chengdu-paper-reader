import { useEffect, useMemo, useState } from "react";
import { ArrowRight, GraduationCap, LoaderCircle } from "lucide-react";
import { citiesOf, loadUniversities, schoolsOf, type UniversityIndex } from "../lib/universities";
import { DEGREES, REGION_ALIASES, type Degree, type Profile } from "../lib/profile";

/** 港澳台没有城市层级，名单也不全，所以提供「手动填写」兜底 */
const SPECIAL_REGIONS = ["香港特别行政区", "澳门特别行政区", "中国台湾地区"];
const OVERSEAS = "海外";
const MANUAL = "__manual__";

type Props = {
  open: boolean;
  initial: Profile | null;
  onSubmit: (profile: Profile) => void;
};

export default function ProfileGate({ open, initial, onSubmit }: Props) {
  const [index, setIndex] = useState<UniversityIndex | null>(null);
  const [region, setRegion] = useState(initial?.region ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [school, setSchool] = useState(initial?.school ?? "");
  const [manualSchool, setManualSchool] = useState(false);
  const [college, setCollege] = useState(initial?.college ?? "");
  const [major, setMajor] = useState(initial?.major ?? "");
  const [degree, setDegree] = useState<Degree | "">((initial?.degree as Degree) ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || index) return;
    let alive = true;
    loadUniversities().then((data) => {
      if (alive) setIndex(data);
    });
    return () => {
      alive = false;
    };
  }, [open, index]);

  const isSpecial = SPECIAL_REGIONS.includes(region);
  const isOverseas = region === OVERSEAS;
  const regionKey = REGION_ALIASES[region] ?? region;

  const provinces = useMemo(() => (index ? Object.keys(index).sort((a, b) => a.localeCompare(b, "zh")) : []), [index]);
  const regionOptions = useMemo(() => {
    // 数据里叫「台湾省」，界面按用户要求显示为「中国台湾地区」；港澳保留全称
    const list = provinces.map((item) => (item === "台湾省" ? "中国台湾地区" : item));
    return [...list, OVERSEAS];
  }, [provinces]);

  const cities = useMemo(() => (index && regionKey ? citiesOf(index, regionKey) : []), [index, regionKey]);
  const schools = useMemo(() => {
    if (!index || !regionKey) return [];
    if (isOverseas) return [];
    if (isSpecial) return schoolsOf(index, regionKey, "其他");
    return city ? schoolsOf(index, regionKey, city) : [];
  }, [index, regionKey, city, isSpecial, isOverseas]);

  if (!open) return null;

  const showManual = isOverseas || manualSchool;
  const ready = Boolean(
    region &&
      (isOverseas ? true : isSpecial ? true : city) &&
      school.trim() &&
      major.trim() &&
      degree,
  );

  const submit = () => {
    if (!ready) {
      setError("请把地区、学校、专业和学历层次填完。");
      return;
    }
    setError("");
    onSubmit({
      region,
      city: isOverseas || isSpecial ? city.trim() : city,
      school: school.trim(),
      college: college.trim(),
      major: major.trim(),
      degree: degree as Degree,
    });
  };

  return (
    <div className="gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-card">
        <div className="gate-head">
          <span className="gate-icon"><GraduationCap size={20} /></span>
          <div>
            <h2 id="gate-title">你好，同学！</h2>
            <p>请输入你的院校和专业，以便我们为你提供更好的服务。</p>
          </div>
        </div>

        {!index ? (
          <div className="gate-loading"><LoaderCircle size={16} className="spin" />正在加载院校名单…</div>
        ) : (
          <div className="gate-fields">
            <label>
              <span>地区</span>
              <select
                value={region}
                onChange={(event) => {
                  setRegion(event.target.value);
                  setCity("");
                  setSchool("");
                  setManualSchool(false);
                }}
              >
                <option value="">请选择</option>
                {regionOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label>
              <span>{isOverseas ? "国家 / 地区" : "城市"}</span>
              {isOverseas ? (
                <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="如：新加坡 / 英国" />
              ) : (
                <select
                  value={city}
                  disabled={!region || isSpecial}
                  onChange={(event) => {
                    setCity(event.target.value);
                    setSchool("");
                    setManualSchool(false);
                  }}
                >
                  <option value="">{!region ? "先选地区" : isSpecial ? "无需选择" : "请选择"}</option>
                  {cities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              )}
            </label>

            <label className="gate-wide">
              <span>学校</span>
              {showManual ? (
                <input
                  value={school}
                  onChange={(event) => setSchool(event.target.value)}
                  placeholder="请输入学校全名"
                  autoComplete="off"
                />
              ) : (
                <select
                  value={school}
                  disabled={isOverseas || (!isSpecial && !city)}
                  onChange={(event) => {
                    if (event.target.value === MANUAL) {
                      setSchool("");
                      setManualSchool(true);
                      return;
                    }
                    setSchool(event.target.value);
                  }}
                >
                  <option value="">
                    {isOverseas ? "请在上方选择" : !isSpecial && !city ? "先选城市" : schools.length ? "请选择" : "可直接填写"}
                  </option>
                  {schools.map((item) => <option key={item} value={item}>{item}</option>)}
                  {isSpecial && <option value={MANUAL}>不在列表里，手动填写</option>}
                </select>
              )}
            </label>

            <label>
              <span>学院 <small>选填</small></span>
              <input value={college} onChange={(event) => setCollege(event.target.value)} placeholder="如：经济学院" />
            </label>

            <label>
              <span>学历层次</span>
              <select value={degree} onChange={(event) => setDegree(event.target.value as Degree | "")}>
                <option value="">请选择</option>
                {DEGREES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label className="gate-wide">
              <span>专业</span>
              <input
                value={major}
                onChange={(event) => setMajor(event.target.value)}
                placeholder="请输入你的专业全名"
                autoComplete="off"
              />
            </label>
          </div>
        )}

        {error && <p className="gate-error" role="alert">{error}</p>}

        <div className="gate-actions">
          <button className="primary-button gate-submit" disabled={!ready} onClick={submit}>
            进入工作台<ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
