/**
 * One synthetic Rich Text file, written the way word processors write one: a font table with a GBK font, a stylesheet with
 * outline-level headings, a list table, an information group, a header, a footer and a footnote, hidden text, hyperlink and
 * picture fields (the picture of `INCLUDEPICTURE` is named but not in the file), embedded picture groups, list paragraphs
 * and table rows. Every word is the suite's own invention: no manuscript text, no outside file (Issue #766, item 3).
 *
 * It is carried as source text, not as a `.rtf` file: the repository ignores document formats everywhere (`.gitignore`, the
 * protected-material guard), and a synthetic file does not widen that rule. `tests/unit/material-formats-fixtures.test.ts`
 * reads it through the RTF reader as bytes.
 */
export const SYNTHETIC_RTF = String.raw`{\rtf1\ansi\ansicpg1252\deff0\nouicompat\deflang1033\deflangfe2052
{\fonttbl{\f0\fnil\fcharset0 Calibri;}{\f1\fnil\fcharset134 SimSun;}{\f2\froman\fprq2\fcharset0 Times New Roman;}}
{\colortbl ;\red0\green0\blue0;\red255\green0\blue0;}
{\*\listtable{\list\listtemplateid1\listsimple1{\listlevel\levelnfc23\leveljc0{\leveltext\'01\'b7;}{\levelnumbers;}\f2\li720\fi-360}\listid1}}
{\*\listoverridetable{\listoverride\listid1\listoverridecount0\ls1}}
{\stylesheet{\ql\f0\fs22 Normal;}{\s1\ql\sbasedon0\snext0\outlinelevel0\b\fs32 heading 1;}{\s2\ql\sbasedon0\snext0\outlinelevel1\b\fs26 heading 2;}{\*\cs10\additive Default Paragraph Font;}}
{\*\generator Synthetic fixture writer;}
{\info{\title Synthetic RTF: Harbour and Bell Tower}{\author Synthetic Author}{\creatim\yr2026\mo10\dy15}}
\viewkind4\uc1
{\header\pard\plain header text is not read\par}
{\footer\pard\plain footer text is not read\par}
\pard\plain\s1\ql\outlinelevel0\f0\fs32\b First section\par
\pard\plain\s0\ql\f0\fs22 The bell tower of the synthetic harbour rang seven times at dawn, and the fog had not lifted.\par
\pard\plain\ql\f0\fs22 She walked along the quay{\footnote\pard\plain\s5\f0\fs18 {\super\chftn}{ footnote text is not read.}} past {\b boats}, {\i ropes} and {\ul nets}.\par
\pard\plain\ql\f1\fs22 \u21512?\u25104?\u26679?\u31295?\u-230?\u28207?\u21475?\u19982?\u-27489?\u27004?\u12290?\par
\pard\plain\ql\f1\fs22 \'b8\'db\'bf\'da\'b5\'c4\'d6\'d3\'c2\'a5\'d4\'da\'c7\'e5\'b3\'bf\'c7\'c3\'c1\'cb\'c6\'df\'cf\'c2\'a3\'ac\'ce\'ed\'bb\'b9\'c3\'bb\'d3\'d0\'c9\'a2\'a1\'a3\par
\pard\plain\s2\ql\outlinelevel1\f0\fs26\b Second section\par
\pard\plain\ql\f0\fs22 {\v Hidden draft text is not read.}Visible text follows the hidden run.\par
\pard\plain\ql\f0\fs22 {\field{\*\fldinst{ HYPERLINK "https://example.invalid/harbour" }}{\fldrslt{\cf2\ul a synthetic link}}} and a picture field: {\field{\*\fldinst{ INCLUDEPICTURE "missing-image.png" \\* MERGEFORMAT \\d }}{\fldrslt{}}}that is absent from the file.\par
\pard\plain\ql\f0\fs22 {\*\shppict{\pict{\*\picprop}\picscalex100\picscaley100\piccropl0\picw100\pich100\picwgoal2000\pichgoal2000\pngblip 89504e470d0a1a0a}}{\*\nonshppict{\pict\wmetafile8\picw100\pich100 0102030405}}After the pictures.\par
\pard\plain\ql\li720\fi-360{\*\pn\pnlvlblt{\pntxtb\'b7}}\ls1\f0\fs22 {\pntext\f2\'b7\tab}First list item\par
\pard\plain\ql\li1080\fi-360\ls1\f0\fs22 Nested list item\par
\trowd\trgaph108\trleft-108\cellx3000\cellx6000
\pard\intbl\ql\f0\fs22 Hour\cell Level\cell\row
\trowd\trgaph108\trleft-108\cellx3000\cellx6000
\pard\intbl\ql\f0\fs22 Noon\cell High\cell\row
\pard\plain\ql\f0\fs22 {\*\bkmkstart note1}Closing paragraph{\*\bkmkend note1}.\par
}`;
