#!/usr/bin/env sh
set -eu

DEPLOY_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$DEPLOY_ROOT"
# shellcheck disable=SC1091
. "$DEPLOY_ROOT/deploy/lib.sh"

header() {
  cat <<'EOF'
+----------------------------------------------------------+
|                     ATHENA OPERATIONS                    |
+----------------------------------------------------------+
EOF
}

configure_reset_password() {
  deploy_require sha256sum || deploy_require shasum
  printf 'Nova senha de proteção do reset (mínimo 12 caracteres): '
  stty -echo
  IFS= read -r first_password || first_password=''
  stty echo
  printf '\nConfirme a senha: '
  stty -echo
  IFS= read -r second_password || second_password=''
  stty echo
  printf '\n'
  [ "${#first_password}" -ge 12 ] || { printf 'Senha muito curta.\n' >&2; return 1; }
  [ "$first_password" = "$second_password" ] || { printf 'As senhas não coincidem.\n' >&2; return 1; }
  umask 077
  deploy_sha256 "$first_password" > "$DEPLOY_RESET_HASH_FILE"
  chmod 600 "$DEPLOY_RESET_HASH_FILE"
  unset first_password second_password
  printf 'Senha de reset configurada; apenas o hash SHA-256 local foi salvo.\n'
}

normal_up() {
  deploy_require docker
  deploy_compose up -d --build
}

dev_up() {
  deploy_require docker
  printf 'Hot reload ativo. Use Ctrl+C para encerrar os logs sem remover volumes.\n'
  deploy_compose_dev up --build
}

demo_on() {
  (cd "$DEPLOY_ROOT" && sh scripts/demo-on.sh)
}

demo_off() {
  (cd "$DEPLOY_ROOT" && sh scripts/demo-off.sh)
}

demo_status() {
  (cd "$DEPLOY_ROOT" && sh scripts/demo-status.sh)
}

restart_normal() {
  deploy_require docker
  deploy_compose restart
}

stop_normal() {
  deploy_require docker
  deploy_compose stop
  printf 'Stack padrão parada; containers e volumes foram preservados.\n'
}

show_status() {
  deploy_require docker
  printf 'Stack padrão:\n'
  deploy_compose ps
  printf '\nVolumes ATHENA:\n'
  deploy_compose config --volumes
}

show_logs() {
  deploy_require docker
  deploy_compose logs --tail=200 -f
}

restore_database() {
  deploy_require docker
  printf 'Caminho do backup SQL: '
  IFS= read -r restore_file
  [ -f "$restore_file" ] || { printf 'Arquivo não encontrado.\n' >&2; return 1; }
  printf 'Digite RESTAURAR BACKUP para substituir dados no banco atual: '
  IFS= read -r restore_confirmation
  [ "$restore_confirmation" = 'RESTAURAR BACKUP' ] || { printf 'Restore cancelado.\n'; return 0; }
  (cd "$DEPLOY_ROOT" && sh scripts/restore.sh "$restore_file")
  printf 'Restore concluído.\n'
}

reset_database() {
  deploy_require docker
  deploy_require node
  [ -f "$DEPLOY_RESET_HASH_FILE" ] || {
    printf 'Configure primeiro a senha do reset (opção 10). Nenhuma alteração foi feita.\n' >&2
    return 1
  }

  # First gate: a fresh pg_dump must succeed before any stop/remove operation.
  reset_backup="$(deploy_backup_database)" || return 1
  printf 'Backup confirmado: %s\n' "$reset_backup"

  printf 'Senha de proteção do reset: '
  stty -echo
  IFS= read -r reset_password || reset_password=''
  stty echo
  printf '\n'
  expected_hash="$(tr -d '[:space:]' < "$DEPLOY_RESET_HASH_FILE")"
  actual_hash="$(deploy_sha256 "$reset_password")"
  unset reset_password
  [ -n "$expected_hash" ] && [ "$actual_hash" = "$expected_hash" ] || {
    printf 'Senha inválida. Banco preservado.\n' >&2
    return 1
  }

  printf 'Digite exatamente APAGAR BANCO para remover somente o volume PostgreSQL ATHENA: '
  IFS= read -r reset_confirmation
  [ "$reset_confirmation" = 'APAGAR BANCO' ] || { printf 'Reset cancelado. Banco preservado.\n'; return 0; }

  postgres_volume="$(deploy_postgres_volume)" || {
    printf 'Não foi possível identificar com segurança o volume postgres_data do ATHENA.\n' >&2
    return 1
  }
  printf 'Removendo somente o volume: %s\n' "$postgres_volume"
  deploy_compose stop api postgres || true
  deploy_compose rm -f api postgres
  docker volume rm "$postgres_volume"
  deploy_compose up -d --build
  printf 'Banco recriado. Backup preservado em: %s\n' "$reset_backup"
}

run_action() {
  case "$1" in
    dev) dev_up ;;
    normal) normal_up ;;
    demo-on) demo_on ;;
    demo-off) demo_off ;;
    demo-status) demo_status ;;
    restart) restart_normal ;;
    stop) stop_normal ;;
    status) show_status ;;
    logs) show_logs ;;
    backup) deploy_backup_database ;;
    restore) restore_database ;;
    password) configure_reset_password ;;
    reset-db) reset_database ;;
    *) return 64 ;;
  esac
}

menu() {
  while :; do
    header
    cat <<'EOF'
  1) Docker dev (hot reload)
  2) Docker normal
  3) Demo Funnel: ligar
  4) Demo Funnel: desligar
  5) Demo Funnel: status
  6) Reiniciar stack normal
  7) Parar stack normal
  8) Status
  9) Logs
 10) Backup PostgreSQL
 11) Configurar senha do reset
 12) Restaurar backup
 13) RESETAR BANCO (destrutivo)
  0) Sair
EOF
    printf 'Escolha: '
    IFS= read -r choice || exit 0
    case "$choice" in
      1) dev_up ;;
      2) normal_up ;;
      3) demo_on ;;
      4) demo_off ;;
      5) demo_status ;;
      6) restart_normal ;;
      7) stop_normal ;;
      8) show_status ;;
      9) show_logs ;;
      10) deploy_backup_database ;;
      11) configure_reset_password ;;
      12) restore_database ;;
      13) reset_database ;;
      0) exit 0 ;;
      *) printf 'Opção inválida.\n' >&2 ;;
    esac
    printf '\nPressione Enter para voltar ao menu...'
    IFS= read -r _ || exit 0
  done
}

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ "$#" -eq 0 ]; then
  menu
else
  run_action "$1" || {
    printf 'Uso: %s [dev|normal|demo-on|demo-off|demo-status|restart|stop|status|logs|backup|restore|password|reset-db]\n' "$0" >&2
    exit 64
  }
fi
