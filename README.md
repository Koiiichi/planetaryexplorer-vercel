# Planetary Explorer
2025 NASA Space Apps Challenge: https://www.spaceappschallenge.org/2025/find-a-team/slack-overflow/?tab=project

Project Link: https://planetaryexplorer.vercel.app/

## Run
1) `cp .env.example .env.local` and set:
   - `NEXT_PUBLIC_BACKEND_URL` if you expose FastAPI somewhere else
   - `NEXT_PUBLIC_GAIA_SKYMAP_URL` to override the default Milky Way panorama (optional)
2) `python3 -m venv .venv && source .venv/bin/activate`
3) `pip install -r backend/requirements.txt`
4) `uvicorn backend.main:app --reload`
5) In a new terminal: `npm install`
6) `npm run dev` → http://localhost:3000

## Stack
- Next.js + TypeScript + Tailwind
- OpenSeadragon deep-zoom viewer (single image mode)
- Milky Way / planetary WMTS tiles proxied via FastAPI
