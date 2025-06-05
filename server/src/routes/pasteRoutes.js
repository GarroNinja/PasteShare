router.put('/:id', async (req, res) => {
  console.log('--- UPDATE ROUTE CALLED ---');
  try {
    const { id } = req.params;
    const { title, content, blocks } = req.body;
    console.log('Request body:', req.body);
    console.log('typeof blocks:', typeof blocks, 'blocks:', blocks);
    if (!req.db || !req.db.success) {
      console.error('No DB connection');
      return res.status(503).json({ message: 'Database connection error' });
    }
    const { sequelize } = req.db;
    const pasteQuery = `SELECT * FROM pastes WHERE id = $1 OR "customUrl" = $1`;
    const [pasteResults] = await sequelize.query(pasteQuery, {
      bind: [id],
      type: sequelize.QueryTypes.SELECT,
      raw: true
    });
    if (!pasteResults || pasteResults.length === 0) {
      console.error('Paste not found');
      return res.status(404).json({ message: 'Paste not found' });
    }
    const paste = pasteResults[0];
    if (!paste.isEditable) {
      console.error('Paste not editable');
      return res.status(403).json({ message: 'This paste is not editable' });
    }
    if (paste.expiresAt && new Date(paste.expiresAt) < new Date()) {
      console.error('Paste expired');
      return res.status(404).json({ message: 'Paste has expired' });
    }
    const transaction = await sequelize.transaction();
    try {
      if (title !== undefined) {
        await sequelize.query(
          `UPDATE pastes SET title = $1 WHERE id = $2`,
          {
            bind: [title, paste.id],
            type: sequelize.QueryTypes.UPDATE,
            transaction
          }
        );
        console.log(`Updated title for paste ${paste.id}`);
      }
      let isJupyterUpdate = false;
      let parsedBlocks = [];
      try {
        if (typeof blocks === 'string') {
          parsedBlocks = JSON.parse(blocks);
          isJupyterUpdate = Array.isArray(parsedBlocks) && parsedBlocks.length > 0;
        } else if (Array.isArray(blocks)) {
          parsedBlocks = blocks;
          isJupyterUpdate = parsedBlocks.length > 0;
        }
      } catch (e) {
        isJupyterUpdate = false;
      }
      console.log('isJupyterUpdate:', isJupyterUpdate, 'parsedBlocks:', parsedBlocks);
      if (isJupyterUpdate) {
        console.log('Processing Jupyter-style paste update');
        const deleteQuery = `DELETE FROM blocks WHERE "pasteId" = $1`;
        await sequelize.query(deleteQuery, {
          bind: [paste.id],
          type: sequelize.QueryTypes.DELETE,
          transaction
        });
        let insertedCount = 0;
        for (let i = 0; i < parsedBlocks.length; i++) {
          const block = parsedBlocks[i];
          if (!block) continue;
          const blockId = (block.id && typeof block.id === 'string' && 
                     /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(block.id))
            ? block.id 
            : uuidv4();
          const blockContent = block.content || '';
          const blockLanguage = block.language || 'text';
          const blockOrder = i;
          if (blockContent.trim() === '') continue;
          console.log('Inserting block:', {
            pasteId: paste.id,
            blockId,
            blockContent,
            blockLanguage,
            blockOrder
          });
          try {
            await sequelize.query(`
              INSERT INTO blocks (id, content, language, "order", "pasteId", "createdAt", "updatedAt") 
              VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            `, {
              bind: [blockId, blockContent, blockLanguage, blockOrder, paste.id],
              type: sequelize.QueryTypes.INSERT,
              transaction
            });
            insertedCount++;
          } catch (blockInsertError) {
            console.error('Block insert error:', blockInsertError);
          }
        }
        console.log(`Inserted ${insertedCount} blocks for paste ${paste.id}`);
        if (insertedCount === 0) {
          await transaction.rollback();
          console.error('No blocks inserted for Jupyter-style paste update!');
          return res.status(500).json({ message: 'No blocks inserted for Jupyter-style paste update.' });
        }
        const jupyterUpdateQuery = `
          UPDATE pastes 
          SET "isJupyterStyle" = true, content = '', "updatedAt" = NOW() 
          WHERE id = $1
        `;
        await sequelize.query(jupyterUpdateQuery, {
          bind: [paste.id],
          type: sequelize.QueryTypes.UPDATE,
          transaction
        });
      } else if (content !== undefined) {
        console.log(`Updating regular paste content for ${paste.id}, length: ${content.length}`);
        const updateContentQuery = `
          UPDATE pastes 
          SET content = $1, "updatedAt" = NOW() 
          WHERE id = $2
        `;
        await sequelize.query(updateContentQuery, {
          bind: [content, paste.id],
          type: sequelize.QueryTypes.UPDATE,
          transaction
        });
      }
      await transaction.commit();
      console.log(`Successfully committed updates for paste ${paste.id}`);
      const [allBlocks] = await sequelize.query(
        `SELECT id, content, language, "order" FROM blocks WHERE "pasteId" = $1 ORDER BY "order" ASC`,
        { bind: [paste.id], type: sequelize.QueryTypes.SELECT }
      );
      console.log('All blocks for paste after update:', allBlocks);
      const [updatedPaste] = await sequelize.query(
        `SELECT * FROM pastes WHERE id = $1`,
        {
          bind: [paste.id],
          type: sequelize.QueryTypes.SELECT,
          plain: true
        }
      );
      const blocksQuery = `
        SELECT id, content, language, "order" 
        FROM blocks 
        WHERE "pasteId" = $1 
        ORDER BY "order" ASC
      `;
      const [blocksResult] = await sequelize.query(blocksQuery, {
        bind: [paste.id],
        type: sequelize.QueryTypes.SELECT
      });
      let isJupyterStyle = false;
      let updatedBlocks = [];
      if (blocksResult && blocksResult.length > 0) {
        console.log(`Found ${blocksResult.length} blocks for paste ${paste.id}`);
        updatedBlocks = blocksResult;
        isJupyterStyle = true;
      } else {
        console.log(`No blocks found for paste ${paste.id}`);
        updatedBlocks = [];
      }
      return res.status(200).json({
        message: 'Paste updated successfully',
        paste: {
          id: updatedPaste.id,
          title: updatedPaste.title || 'Untitled Paste',
          content: isJupyterStyle ? '' : (updatedPaste.content || ''),
          expiresAt: updatedPaste.expiresAt,
          isPrivate: updatedPaste.isPrivate === true,
          isEditable: updatedPaste.isEditable === true,
          customUrl: updatedPaste.customUrl,
          createdAt: updatedPaste.createdAt,
          updatedAt: updatedPaste.updatedAt,
          views: updatedPaste.views || 0,
          isJupyterStyle: updatedPaste.isJupyterStyle === true || isJupyterStyle,
          blocks: updatedBlocks,
          canEdit: updatedPaste.isEditable === true
        }
      });
    } catch (error) {
      try {
        if (transaction) await transaction.rollback();
        console.error('Transaction rolled back due to error:', error);
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      return res.status(500).json({
        message: 'Server error updating paste',
        error: error.message
      });
    }
  } catch (error) {
    console.error('Unhandled error in update paste route:', error);
    return res.status(500).json({
      message: 'Server error updating paste',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}); 