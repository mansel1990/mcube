/* Wall frames use raw images so the drifting rows keep their cropped sizes. */
/* eslint-disable @next/next/no-img-element */

import { wallRows } from "./content";

export function ShotWall() {
  return (
    <div className="wall" aria-hidden="true">
      <div className="wall-in">
        {wallRows.map((row, rowIndex) => (
          <div key={rowIndex} className={rowIndex === 0 ? "track a" : "track b"}>
            {[0, 1].map((copy) => (
              <div className="set" key={copy}>
                {row.map((shot) => (
                  <img
                    key={`${copy}-${shot.src}`}
                    className={shot.wide ? "w" : "m"}
                    src={shot.src}
                    alt=""
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
