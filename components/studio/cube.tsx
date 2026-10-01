const faces = [
  {
    name: "front",
    label: "Logic",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h12l4 6-10 12L2 9Z" />
        <path d="M11 3 8 9l4 12 4-12-3-6M2 9h20" />
      </svg>
    ),
  },
  {
    name: "right",
    label: "Intelligence",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 4 4 3 3 0 0 0 3-2V5a3 3 0 0 0-3-2Z" />
        <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-4 4 3 3 0 0 1-3-2" />
      </svg>
    ),
  },
  {
    name: "back",
    label: "Engine",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
      </svg>
    ),
  },
  {
    name: "left",
    label: "Deployment",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2c4 3 5 8 3 13H9C7 10 8 5 12 2Z" />
        <path d="M9 15l-3 3 3 1M15 15l3 3-3 1M12 19v3" />
        <circle cx="12" cy="9" r="1.6" />
      </svg>
    ),
  },
  {
    name: "top",
    label: "Hosting",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
        <path d="M7 7h.01M7 17h.01" />
      </svg>
    ),
  },
  {
    name: "bottom",
    label: "Scale",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 20h18M6 16v-3M11 16V9M16 16V5" />
      </svg>
    ),
  },
];

export function StudioCube() {
  return (
    <div
      className="stage"
      role="img"
      aria-label="A slowly turning cube with faces labelled Logic, Intelligence, Engine, Deployment, Hosting and Scale"
    >
      <div className="cube3d">
        {faces.map((face) => (
          <div key={face.name} className={`face ${face.name}`}>
            {face.icon}
            {face.label}
          </div>
        ))}
      </div>
    </div>
  );
}
