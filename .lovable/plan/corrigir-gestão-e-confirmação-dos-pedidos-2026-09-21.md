# Corrigir gestão e confirmação dos pedidos

## O que será feito
- Na aba **Pedidos**, adicionar uma ação clara para marcar o pedido como entregue; essa ação também enviará a confirmação ao cliente pelo WhatsApp, mesmo quando feita pelo administrador.
- Adicionar a opção de apagar um pedido, com confirmação antes da exclusão para evitar remoções acidentais.
- Corrigir a mensagem de pedido feito pelo site para enviar a chave Pix real, sem repetir o nome do estabelecimento no lugar da chave.
- Separar endereço, ponto de referência e localização compartilhada para a mensagem ficar legível e o mapa representar apenas o destino informado pelo cliente.
- Manter o aviso de confirmação e os totais do pedido em formato organizado.

## Validação
- Confirmar no painel que as ações de entregue e apagar funcionam.
- Confirmar que marcar como entregue dispara a mensagem no WhatsApp.
- Simular um pedido Pix pelo site e verificar a chave e o endereço/localização na mensagem final.

## Detalhes técnicos
- As ações sensíveis do painel serão executadas no servidor com validação de administrador.
- A entrega atualizará status e horário antes de enviar o aviso.
- A exclusão removerá somente o pedido escolhido.
