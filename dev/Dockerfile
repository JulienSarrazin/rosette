# Contexte de build attendu : le dossier tac-calc/ (parent de dev/), pas dev/
# lui-même — voir docker-compose.yml. Sert webapp/ tel quel, exactement comme
# ce sera déployé sur l'hébergement OVH mutualisé.
FROM nginx:alpine
COPY dev/nginx.conf /etc/nginx/conf.d/default.conf
COPY webapp /usr/share/nginx/html
EXPOSE 8080
