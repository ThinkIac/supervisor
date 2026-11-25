# Contratos

API: `Supervisor (index.cjs), main/rootFrom (cli.cjs), provideSupervisor/createRuntimeModule (runtime.cjs)`.

Nome npm preservado: @logos/supervisor. CLI logos-supervisor. Serviços via logos.supervisor.json. Controle privado em .logos/supervisor, exclusão por flock, guardian contra órfãos, readiness IPC, heartbeat, backoff e orçamento de restart. Requer Linux, /proc e grupos de processos.

Host seleciona o pacote, fornece portas e autoridade; o provedor instala recursos e participa do ciclo de vida. A compilação ocorre na distribuição. Consumidores CommonJS não precisam de hook .type.
