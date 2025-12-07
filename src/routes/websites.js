const {
  getWebsites,
  getWebsiteByDomain,
  updateWebsite,
  deleteWebsite
} = require('../services/websiteService');

/**
 * Register website-related routes
 * @param {import('fastify').FastifyInstance} fastify
 */
async function websiteRoutes(fastify) {
  // GET /websites - List all websites
  fastify.get('/websites', async (request, reply) => {
    try {
      const { active, limit = 100, offset = 0 } = request.query;

      const websites = await getWebsites({
        activeOnly: active === 'true' || active === '1',
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return reply.code(200).send({
        total: websites.length,
        websites: websites
      });
    } catch (error) {
      console.error('List websites error:', error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve websites'
      });
    }
  });

  // GET /websites/:domain - Get specific website
  fastify.get('/websites/:domain', async (request, reply) => {
    try {
      const { domain } = request.params;

      const website = await getWebsiteByDomain(domain);

      if (!website) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Website '${domain}' not found`
        });
      }

      return reply.code(200).send(website);
    } catch (error) {
      console.error('Get website error:', error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve website'
      });
    }
  });

  // PUT /websites/:domain - Update website metadata
  fastify.put('/websites/:domain', async (request, reply) => {
    try {
      const { domain } = request.params;
      const updates = request.body;

      const success = await updateWebsite(domain, updates);

      if (!success) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Website '${domain}' not found`
        });
      }

      // Fetch and return updated website
      const { getWebsiteByDomain } = require('../services/websiteService');
      const website = await getWebsiteByDomain(domain);

      return reply.code(200).send(website);
    } catch (error) {
      console.error('Update website error:', error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update website'
      });
    }
  });

  // DELETE /websites/:domain - Delete website
  fastify.delete('/websites/:domain', async (request, reply) => {
    try {
      const { domain } = request.params;

      const success = await deleteWebsite(domain);

      if (!success) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Website '${domain}' not found`
        });
      }

      return reply.code(200).send({
        status: 'ok',
        message: 'Website and associated logs deleted successfully'
      });
    } catch (error) {
      console.error('Delete website error:', error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to delete website'
      });
    }
  });
}

module.exports = websiteRoutes;
