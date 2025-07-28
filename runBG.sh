#!/bin/bash
if [ ! -d ".venv" ] ; then
    python3.11 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    mkdir voices
fi
source .venv/bin/activate
trap "jobs -p | xargs kill ; trap - INT" INT ; chroma run & python coquitts.py
