#!/bin/sh
git pull origin main
npm i
npm rum build
pm2 restart all

# pm2 start pm2.json --env dev


