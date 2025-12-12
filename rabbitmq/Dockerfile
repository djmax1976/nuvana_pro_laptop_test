FROM rabbitmq:3.13.7-management-alpine

# The management plugin is already enabled in the management-alpine image
# No need to enable it manually

# Expose ports
# 5672: AMQP protocol port
# 15672: Management UI port
EXPOSE 5672 15672

# Set default user (guest/guest is the default, but we can override with env vars)
ENV RABBITMQ_DEFAULT_USER=guest
ENV RABBITMQ_DEFAULT_PASS=guest

