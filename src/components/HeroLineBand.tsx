import Image from "next/image";
import { Reveal } from "./Reveal";

// The 34 strokes of /public/hero-line-final.svg, inlined so each path can be
// animated individually (an <img>/next/image can't drive per-path stroke
// animation). Already ordered left-to-right by starting x — drawing them in
// this sequence, each with pathLength=1 and its own stroke-dashoffset delay,
// produces a "being sketched" cascade with no connecting jump-lines. Do NOT
// merge these into one path and do NOT swap this for a clip-path wipe — the
// separate-path sequence is what avoids the diagonal scribble artifact.
const HERO_LINE_PATHS = [
  "M 417.0 230.0 L 431.0 230.0 L 437.0 227.0 L 441.0 221.0 L 443.0 213.0 L 441.0 166.0 L 444.0 151.0 L 448.0 142.0 L 452.0 138.0 L 456.0 143.0 L 464.0 143.0 L 470.0 146.0 L 483.0 164.0 L 488.0 181.0 L 487.0 190.0 L 481.0 204.0 L 483.0 212.0 L 488.0 215.0 L 495.0 216.0 L 502.0 215.0 L 503.0 213.0 L 509.0 213.0",
  "M 428.0 326.0 L 432.0 316.0 L 433.0 293.0 L 431.0 278.0 L 428.0 277.0 L 425.0 283.0 L 424.0 297.0 L 427.0 309.0 L 431.0 314.0",
  "M 430.0 231.0 L 460.0 239.0 L 475.0 239.0 L 485.0 231.0 L 495.0 217.0",
  "M 432.0 317.0 L 440.0 319.0 L 447.0 318.0 L 469.0 307.0 L 485.0 293.0 L 491.0 273.0 L 501.0 266.0 L 507.0 266.0 L 511.0 270.0 L 513.0 288.0 L 515.0 290.0 L 518.0 289.0 L 519.0 273.0 L 514.0 243.0 L 509.0 226.0 L 502.0 216.0",
  "M 479.0 309.0 L 483.0 315.0 L 492.0 316.0 L 504.0 311.0 L 520.0 299.0 L 521.0 307.0 L 515.0 315.0 L 508.0 319.0 L 507.0 325.0 L 516.0 337.0 L 524.0 341.0 L 529.0 341.0 L 538.0 334.0 L 541.0 327.0 L 541.0 319.0 L 538.0 312.0 L 525.0 297.0 L 522.0 290.0 L 523.0 283.0 L 529.0 278.0 L 536.0 278.0 L 555.0 289.0 L 563.0 289.0 L 580.0 281.0 L 586.0 283.0 L 594.0 278.0 L 608.0 276.0 L 615.0 282.0 L 615.0 287.0 L 611.0 291.0 L 597.0 290.0 L 585.0 284.0",
  "M 482.0 316.0 L 477.0 323.0 L 468.0 327.0 L 414.0 328.0 L 413.0 330.0 L 417.0 332.0 L 423.0 329.0",
  "M 502.0 212.0 L 497.0 206.0 L 493.0 196.0 L 490.0 168.0 L 485.0 146.0 L 479.0 135.0 L 471.0 127.0 L 467.0 125.0 L 441.0 126.0 L 437.0 128.0 L 428.0 139.0 L 425.0 151.0 L 425.0 181.0 L 427.0 197.0 L 426.0 216.0 L 420.0 223.0 L 407.0 229.0 L 402.0 234.0 L 397.0 244.0 L 394.0 264.0 L 395.0 299.0 L 400.0 333.0 L 407.0 349.0 L 412.0 354.0 L 419.0 357.0 L 423.0 362.0 L 414.0 389.0 L 415.0 393.0 L 417.0 395.0 L 419.0 394.0 L 418.0 383.0",
  "M 557.0 148.0 L 557.0 150.0 L 529.0 168.0 L 524.0 169.0 L 518.0 175.0 L 518.0 179.0 L 529.0 169.0",
  "M 561.0 149.0 L 558.0 147.0 L 563.0 144.0",
  "M 564.0 318.0 L 579.0 315.0 L 584.0 312.0 L 587.0 303.0 L 585.0 286.0 L 587.0 286.0",
  "M 584.0 313.0 L 606.0 316.0 L 628.0 316.0 L 638.0 313.0 L 653.0 302.0 L 663.0 287.0 L 667.0 276.0 L 667.0 270.0 L 665.0 268.0 L 661.0 268.0 L 652.0 275.0 L 642.0 289.0 L 638.0 289.0 L 625.0 277.0 L 613.0 271.0 L 586.0 273.0 L 581.0 269.0 L 577.0 260.0 L 574.0 242.0 L 573.0 181.0 L 570.0 170.0 L 562.0 153.0 L 563.0 146.0 L 568.0 143.0 L 572.0 134.0 L 572.0 117.0 L 564.0 88.0 L 565.0 79.0 L 573.0 61.0 L 586.0 46.0 L 592.0 43.0 L 597.0 43.0 L 607.0 48.0 L 620.0 60.0 L 629.0 74.0 L 630.0 91.0 L 628.0 97.0 L 624.0 97.0 L 622.0 90.0 L 617.0 85.0 L 611.0 83.0 L 603.0 84.0 L 596.0 89.0 L 591.0 99.0 L 578.0 102.0 L 575.0 105.0 L 574.0 113.0 L 582.0 136.0 L 588.0 145.0 L 595.0 150.0 L 603.0 150.0 L 612.0 143.0 L 621.0 127.0 L 622.0 119.0",
  "M 621.0 128.0 L 622.0 136.0 L 627.0 144.0 L 635.0 150.0 L 661.0 161.0 L 668.0 168.0 L 672.0 180.0 L 675.0 208.0 L 675.0 243.0 L 673.0 250.0 L 666.0 256.0 L 644.0 262.0 L 641.0 261.0 L 632.0 214.0 L 629.0 184.0 L 630.0 166.0 L 635.0 160.0 L 642.0 161.0 L 665.0 185.0 L 672.0 188.0",
  "M 674.0 189.0 L 685.0 188.0 L 702.0 180.0 L 715.0 168.0 L 717.0 164.0 L 718.0 150.0 L 715.0 144.0 L 715.0 139.0 L 711.0 128.0 L 707.0 124.0 L 704.0 125.0 L 710.0 142.0 L 714.0 144.0",
  "M 690.0 284.0 L 688.0 277.0 L 689.0 254.0 L 692.0 247.0 L 694.0 248.0 L 695.0 252.0 L 695.0 270.0 L 691.0 280.0",
  "M 710.0 126.0 L 706.0 106.0 L 706.0 88.0 L 709.0 80.0 L 716.0 72.0 L 731.0 65.0 L 745.0 65.0 L 760.0 72.0 L 770.0 83.0 L 774.0 95.0 L 773.0 107.0 L 768.0 117.0 L 755.0 130.0 L 737.0 139.0 L 725.0 138.0 L 719.0 134.0 L 715.0 136.0",
  "M 719.0 155.0 L 727.0 168.0 L 737.0 177.0 L 743.0 179.0 L 754.0 178.0 L 762.0 171.0 L 764.0 167.0 L 768.0 152.0 L 769.0 124.0 L 772.0 119.0 L 774.0 120.0 L 774.0 123.0 L 770.0 132.0",
  "M 733.0 282.0 L 721.0 291.0 L 711.0 295.0 L 701.0 295.0 L 695.0 292.0 L 689.0 284.0 L 677.0 291.0 L 672.0 298.0 L 672.0 309.0 L 676.0 317.0 L 681.0 322.0 L 690.0 326.0 L 707.0 326.0 L 715.0 323.0 L 733.0 310.0 L 737.0 310.0 L 744.0 314.0 L 751.0 313.0 L 758.0 306.0 L 758.0 302.0 L 753.0 296.0 L 753.0 291.0 L 756.0 287.0 L 761.0 289.0 L 759.0 302.0",
  "M 739.0 273.0 L 734.0 280.0 L 738.0 287.0 L 741.0 286.0 L 743.0 277.0 L 752.0 271.0 L 761.0 269.0 L 768.0 270.0 L 773.0 275.0 L 773.0 278.0",
  "M 759.0 306.0 L 769.0 312.0 L 782.0 312.0 L 791.0 307.0 L 795.0 307.0 L 818.0 316.0 L 824.0 315.0 L 827.0 312.0 L 832.0 285.0 L 830.0 241.0 L 832.0 200.0 L 837.0 188.0 L 842.0 183.0 L 854.0 178.0 L 858.0 173.0 L 857.0 145.0 L 859.0 131.0 L 869.0 107.0 L 882.0 90.0 L 890.0 86.0 L 898.0 86.0 L 906.0 82.0 L 914.0 82.0 L 928.0 94.0 L 938.0 112.0 L 945.0 142.0 L 948.0 178.0 L 950.0 186.0 L 956.0 195.0 L 956.0 200.0 L 948.0 209.0 L 936.0 211.0 L 930.0 208.0 L 921.0 197.0 L 917.0 187.0 L 919.0 136.0 L 914.0 114.0 L 908.0 106.0 L 904.0 106.0 L 895.0 111.0 L 886.0 120.0 L 880.0 135.0 L 879.0 147.0 L 885.0 162.0 L 896.0 172.0 L 911.0 173.0 L 916.0 171.0",
  "M 768.0 153.0 L 780.0 168.0 L 809.0 181.0 L 818.0 189.0 L 824.0 200.0 L 829.0 220.0",
  "M 774.0 274.0 L 778.0 269.0 L 783.0 268.0 L 785.0 282.0 L 793.0 287.0 L 801.0 285.0 L 808.0 278.0 L 806.0 268.0 L 807.0 249.0 L 810.0 233.0 L 813.0 228.0 L 815.0 229.0 L 815.0 242.0 L 813.0 259.0 L 809.0 272.0",
  "M 808.0 279.0 L 815.0 283.0 L 822.0 283.0 L 830.0 286.0",
  "M 853.0 275.0 L 850.0 253.0 L 851.0 240.0 L 863.0 222.0 L 863.0 219.0 L 856.0 218.0 L 854.0 213.0 L 860.0 190.0 L 864.0 186.0 L 868.0 198.0 L 868.0 210.0 L 866.0 218.0 L 864.0 219.0",
  "M 867.0 304.0 L 882.0 306.0 L 930.0 306.0 L 952.0 302.0 L 962.0 295.0 L 962.0 279.0 L 955.0 266.0 L 949.0 260.0 L 952.0 246.0 L 973.0 208.0 L 972.0 193.0 L 962.0 180.0",
  "M 867.0 218.0 L 875.0 217.0 L 885.0 211.0 L 890.0 202.0 L 894.0 186.0 L 898.0 188.0 L 902.0 196.0 L 905.0 209.0 L 908.0 209.0 L 912.0 203.0 L 916.0 187.0",
  "M 869.0 303.0 L 882.0 280.0 L 908.0 261.0 L 910.0 250.0 L 906.0 241.0 L 914.0 233.0 L 915.0 226.0 L 913.0 221.0 L 904.0 216.0 L 897.0 216.0 L 888.0 220.0 L 886.0 224.0 L 886.0 242.0 L 880.0 248.0 L 872.0 261.0 L 854.0 276.0 L 856.0 287.0 L 856.0 305.0 L 852.0 306.0 L 849.0 302.0 L 849.0 290.0 L 853.0 281.0",
  "M 889.0 242.0 L 894.0 239.0 L 905.0 241.0",
  "M 893.0 241.0 L 898.0 241.0",
  "M 904.0 262.0 L 900.0 250.0 L 906.0 244.0",
  "M 905.0 264.0 L 916.0 271.0 L 930.0 271.0 L 936.0 273.0 L 941.0 278.0 L 948.0 290.0 L 953.0 295.0 L 957.0 296.0",
  "M 908.0 244.0 L 916.0 241.0 L 921.0 235.0 L 923.0 235.0 L 935.0 250.0 L 948.0 258.0",
  "M 946.0 216.0 L 946.0 244.0 L 949.0 253.0",
  "M 962.0 296.0 L 971.0 294.0 L 977.0 288.0 L 980.0 280.0 L 979.0 245.0 L 973.0 209.0",
  "M 967.0 187.0 L 972.0 199.0",
];

// Cascade timing: each path draws over PATH_DURATION, staggered so the whole
// scene finishes sketching in ~TOTAL_DRAW seconds after START_DELAY.
const START_DELAY = 0.4;
const TOTAL_DRAW = 4.5;
const PATH_DURATION = 0.25;
const count = HERO_LINE_PATHS.length;

// The single real result from Sandoitchi's first week — do not fabricate or
// alter these numbers; if more proof arrives later it becomes its own honest
// component, not more content jammed into this card.
const PROOF = {
  eyebrow: "Proof · sandoitchi, Dallas",
  stat: "58%",
  statSub: "application completion, vs ~10% on job boards",
  line: "10 qualified candidates in 7 days.",
  meta: "sandoitchi · one location, one week",
};

export function HeroLineBand() {
  return (
    <Reveal className="grid grid-cols-1 items-center gap-10 min-[820px]:grid-cols-[1.4fr_0.9fr] min-[820px]:gap-10">
      <svg
        // Cropped ~1.5x tighter than the source viewBox (0 0 1035 455), centered
        // on the artwork's actual bounding box (x 394-980, y 43-395) with even
        // 52-unit padding on all sides — makes the illustration bigger without
        // touching the grid ratio (which would shrink the proof card).
        viewBox="342 -9 690 456"
        className="h-auto w-full"
        role="img"
        aria-label="Line illustration of a Dallas café counter"
      >
        {HERO_LINE_PATHS.map((d, i) => {
          const delay = START_DELAY + (i / count) * (TOTAL_DRAW - PATH_DURATION);
          return (
            <path
              key={i}
              d={d}
              pathLength={1}
              fill="none"
              stroke="#f0e8d8"
              strokeWidth={2}
              // Butt, not round: a round cap on a near-zero-length dash (the
              // moment each stroke starts drawing) renders as a visible dot.
              strokeLinecap="butt"
              strokeLinejoin="round"
              className="hero-line-path"
              style={
                {
                  "--hero-line-delay": `${delay}s`,
                  "--hero-line-duration": `${PATH_DURATION}s`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </svg>

      {/* Photo is part of the card's own reveal (fades in with the text, no
          separate animation) — it's a full-bleed banner clipped to the card's
          own rounded-2xl (via overflow-hidden on the card itself), so it scales
          with the card's full width at every breakpoint instead of being boxed
          into a small fixed-width thumbnail next to the text. */}
      <div className="result-card overflow-hidden rounded-2xl border border-[rgba(196,118,40,0.45)] bg-[rgba(240,232,216,0.04)]">
        <div className="relative aspect-[3/2] w-full border-b border-line">
          <Image
            src="/sandoitchi-storefront.jpg"
            alt="sandoitchi storefront, Dallas"
            fill
            sizes="(max-width: 1080px) 100vw, 420px"
            className="object-cover"
          />
        </div>
        <div className="px-8 pb-9 pt-7">
          <p className="t-label mb-4">{PROOF.eyebrow}</p>
          <div className="t-price text-accent">{PROOF.stat}</div>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{PROOF.statSub}</p>
          <p className="t-heading mt-6">{PROOF.line}</p>
          <p className="mt-4 text-[13.5px] text-rose">{PROOF.meta}</p>
        </div>
      </div>
    </Reveal>
  );
}
