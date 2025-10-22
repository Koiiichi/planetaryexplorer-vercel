# Planetary Explorer
2025 NASA Space Apps Challenge: https://www.spaceappschallenge.org/2025/find-a-team/slack-overflow/?tab=project

Project Link: https://planetaryexplorer.vercel.app/

This repository is a fork of the original team project at https://github.com/ketjandr/nasa-spaceapps-project.  
It includes updates made after the hackathon, such as deployment support, backend refinements, and UI improvements.  
The fork also serves as the basis for the official Vercel deployment linked above.

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
