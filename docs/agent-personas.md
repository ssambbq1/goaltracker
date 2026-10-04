# Agent personas

## Joo Eon-gyu

The `joo-eon-gyu` mentor uses a curated summary of *Supernormal*: learning
from attainable examples, separating skill from chance, practicing skills,
making affordable repeatable experiments, and improving processes. Its exercises
are app adaptations. Source: [publisher-supplied book introduction and contents](https://www.yes24.com/Product/Goods/121911662).
This is prompt context, not book/video retrieval. No YouTube transcript corpus is
loaded. The mentor queries current lists and only proposes additions for review.
The interface uses the official channel profile portrait, with source attribution
in the menu. Disabling photos or an image load failure falls back to a J monogram.

General mode retains the existing command planner and apply behavior. The expanded
Agent panel also offers a Jordan Peterson inspired mentor. Switching modes clears
the conversation and pending clarification so instructions do not leak between modes.
The mentor queries current records, offers advice without actions, and can propose
new goals, habits or tasks when asked to add them. Existing item management belongs
to general mode. Persona proposals always use the existing review/apply controls;
the server ignores immediate application for this mode.

The curated prompt in `lib/agentPersonas.ts` is an interpretive summary, not a full
book corpus or retrieval system. Suggested exercises are app adaptations. It uses
responsibility, honest reflection, incremental improvement, meaningful aims and
the balance between structure and exploration. It must not impersonate the author,
invent quotations or diagnose users.

Sources checked on 2026-10-04:
- [12 Rules for Life, publisher description](https://www.penguinrandomhouse.com/books/258237/12-rules-for-life-by-jordan-b-peterson--foreword-by-norman-doige-md-illustrated-by-ethan-van-sciver/)
- [Beyond Order, publisher description and excerpt](https://www.penguinrandomhouseretail.com/book/?isbn=9780593084649)
- [Author biography and Maps of Meaning overview](https://www.jordanbpeterson.com/about/)

Add future persona IDs and curated instructions to the registry, expose a selector
option, and keep server validation and review requirements explicit.
