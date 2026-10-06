# JFK: Competing Hypotheses

**An Analysis of Competing Hypotheses on the assassination of President John F. Kennedy.** By jc0h3n.

**Read it:** https://jc0h3n.github.io/jfk-hypotheses/

Two analyses:

- **(A) Who fired the shots?** Oswald alone; Oswald plus at least one other gunman; Oswald not a shooter.
- **(B) Who was behind it?** No one (Oswald alone); organized crime; elements of the CIA with Cuban exiles; Castro's Cuba; the KGB; U.S. military leaders; a broader coalition ("Rulers of the Realm").

Each piece of evidence cites its source: the official record (Warren Commission, Church Committee, House Select Committee on Assassinations, National Academy of Sciences, Assassination Records Review Board) and published course materials and articles. See [METHOD.md](METHOD.md) for how evidence was chosen and weighted, and [SOURCES.md](SOURCES.md) for the source list.

ACH, developed by Richards J. Heuer Jr. at the CIA, counters confirmation bias: instead of collecting support for a favorite explanation, it rates every piece of evidence against every hypothesis and favors the one with the least evidence *against* it.

## Case library

[`library.html`](https://jc0h3n.github.io/jfk-hypotheses/library.html) holds the facts behind the analysis, searchable and cross-linked:

- **Timeline**: the course's Selected Chronology, 1947–1988 (285 entries), with the Extended Chronology of the weeks around November 22, 1963 being added
- **Theories**: the ten course theses and a sixty-theory primer, each linked to the hypotheses it bears on
- **People**: the 39-person cast of characters
- **20 Key Questions**, linked to the timeline and the matrices
- **Readings**: Reitzes on conspiracy theories at 50; Twining on evidence; Orji on research method
- **Cryptonyms & documents**: CIA code names and aliases, and the FBI/CIA paper trail on Oswald in late 1963
- **Books**: two book lists from the syllabus

Everything there is a summary in our own words with page citations to the course documents; where an entry reports a disputed claim, it says whose claim it is. The data is plain JSON in `data/`.

## How the site works

It's a copy of [Open ACH](https://github.com/jc0h3n/open-ach) that loads the analyses in `analyses/` (listed in `analyses/manifest.json`). Visitors can change ratings and add evidence to try their own judgments; changes stay in their browser. When a new version is published, visitors get it, and any changes they had made are kept as a separate copy.

To publish an update: save the analysis files into `analyses/` (exported from the site or Open ACH, or built from the private workbench) and push.

## Credits and license

- Method: Richards J. Heuer Jr., [*Psychology of Intelligence Analysis*](https://www.cia.gov/resources/csi/books-monographs/psychology-of-intelligence-analysis-2/) (1999), chapter 8.
- Software: [Open ACH](https://github.com/jc0h3n/open-ach), itself inspired by [Burton/Analysis-of-Competing-Hypotheses](https://github.com/Burton/Analysis-of-Competing-Hypotheses). [GNU GPL v3](LICENSE).
- Source documents are cited, not reproduced; they belong to their authors and publishers.
