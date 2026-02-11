import { getRawDb } from '../db/client.js';
import { info, warn } from '../utils/logger.js';

export interface AttributeMapping {
  id: number;
  category: string;
  field_name: string;
  mapping_type: string;
  source_value: string | null;
  target_value: string | null;
  variation_mapping: string | null;
  is_enabled: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface MappingsByCategory {
  [category: string]: AttributeMapping[];
}

/**
 * Get mapping for a specific category and field name.
 */
export const getMapping = async (
  category: string,
  fieldName: string,
): Promise<AttributeMapping | null> => {
  const db = await getRawDb();
  const stmt = db.prepare(
    'SELECT * FROM attribute_mappings WHERE category = ? AND field_name = ? AND is_enabled = 1'
  );
  return stmt.get(category, fieldName) as AttributeMapping | null;
};

/**
 * Resolve mapping value based on mapping type and Shopify product data.
 */
export const resolveMapping = async (
  mapping: AttributeMapping | null,
  shopifyProduct: any,
): Promise<string | null> => {
  if (!mapping) return null;

  switch (mapping.mapping_type) {
    case 'constant':
      return mapping.target_value;
    case 'shopify_field':
      if (!mapping.source_value) return null;
      // Handle nested field access like variants[0].barcode
      if (mapping.source_value.includes('[0].')) {
        const [baseField, nestedField] = mapping.source_value.split('[0].');
        return shopifyProduct[baseField]?.[0]?.[nestedField] || null;
      }
      return shopifyProduct[mapping.source_value] || null;
    case 'formula':
      // For now, return source_value as template string
      // TODO: Implement formula evaluation
      return mapping.source_value;
    case 'edit_in_grid':
    default:
      return null; // Use Shopify default or per-product override
  }
};

/**
 * Get all mappings for a specific category.
 */
export const getMappingsByCategory = async (category: string): Promise<AttributeMapping[]> => {
  const db = await getRawDb();
  const stmt = db.prepare(
    'SELECT * FROM attribute_mappings WHERE category = ? ORDER BY display_order ASC'
  );
  return stmt.all(category) as AttributeMapping[];
};

/**
 * Get all mappings grouped by category.
 */
export const getAllMappings = async (): Promise<MappingsByCategory> => {
  const db = await getRawDb();
  const stmt = db.prepare('SELECT * FROM attribute_mappings ORDER BY category, display_order ASC');
  const allMappings = stmt.all() as AttributeMapping[];

  const grouped: MappingsByCategory = {
    sales: [],
    listing: [],
    payment: [],
    shipping: [],
  };

  for (const mapping of allMappings) {
    if (grouped[mapping.category]) {
      grouped[mapping.category].push(mapping);
    }
  }

  return grouped;
};

/**
 * Update a single mapping.
 */
export const updateMapping = async (
  category: string,
  fieldName: string,
  updates: Partial<{
    mapping_type: string;
    source_value: string | null;
    target_value: string | null;
    variation_mapping: string | null;
    is_enabled: boolean;
  }>,
): Promise<AttributeMapping | null> => {
  const db = await getRawDb();

  // Build update query dynamically based on provided fields
  const updateFields: string[] = [];
  const values: any[] = [];

  if (updates.mapping_type !== undefined) {
    updateFields.push('mapping_type = ?');
    values.push(updates.mapping_type);
  }
  if (updates.source_value !== undefined) {
    updateFields.push('source_value = ?');
    values.push(updates.source_value);
  }
  if (updates.target_value !== undefined) {
    updateFields.push('target_value = ?');
    values.push(updates.target_value);
  }
  if (updates.variation_mapping !== undefined) {
    updateFields.push('variation_mapping = ?');
    values.push(updates.variation_mapping);
  }
  if (updates.is_enabled !== undefined) {
    updateFields.push('is_enabled = ?');
    values.push(updates.is_enabled);
  }

  if (updateFields.length === 0) {
    return null; // No updates provided
  }

  updateFields.push('updated_at = datetime(\'now\')');
  values.push(category, fieldName);

  const updateQuery = `
    UPDATE attribute_mappings 
    SET ${updateFields.join(', ')} 
    WHERE category = ? AND field_name = ?
  `;

  const result = db.prepare(updateQuery).run(...values);

  if (result.changes === 0) {
    return null; // No rows updated
  }

  // Return the updated mapping
  const stmt = db.prepare(
    'SELECT * FROM attribute_mappings WHERE category = ? AND field_name = ?'
  );
  const updatedMapping = stmt.get(category, fieldName) as AttributeMapping;

  info(`[AttributeMapping] Updated ${category}.${fieldName}: ${JSON.stringify(updates)}`);
  return updatedMapping;
};

/**
 * Update multiple mappings at once.
 */
export const updateMappingsBulk = async (
  updates: Array<{
    category: string;
    field_name: string;
    mapping_type?: string;
    source_value?: string | null;
    target_value?: string | null;
    variation_mapping?: string | null;
    is_enabled?: boolean;
  }>,
): Promise<{ updated: number; failed: number; errors: string[] }> => {
  const db = await getRawDb();
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const update of updates) {
    try {
      const { category, field_name, ...updateData } = update;
      const result = await updateMapping(category, field_name, updateData);
      if (result) {
        updated++;
      } else {
        failed++;
        errors.push(`Failed to update ${category}.${field_name}`);
      }
    } catch (err) {
      failed++;
      errors.push(`Error updating ${update.category}.${update.field_name}: ${err}`);
    }
  }

  info(`[AttributeMapping] Bulk update: ${updated} updated, ${failed} failed`);
  return { updated, failed, errors };
};

/**
 * Export all mappings as JSON.
 */
export const exportMappings = async (): Promise<AttributeMapping[]> => {
  const db = await getRawDb();
  const stmt = db.prepare('SELECT * FROM attribute_mappings ORDER BY category, display_order ASC');
  return stmt.all() as AttributeMapping[];
};

/**
 * Import mappings from JSON, updating existing ones.
 */
export const importMappings = async (
  mappings: Array<Omit<AttributeMapping, 'id' | 'created_at' | 'updated_at'>>,
): Promise<{ imported: number; updated: number; errors: string[] }> => {
  const db = await getRawDb();
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  const upsertStmt = db.prepare(`
    INSERT INTO attribute_mappings 
    (category, field_name, mapping_type, source_value, target_value, variation_mapping, is_enabled, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(category, field_name) 
    DO UPDATE SET 
      mapping_type = excluded.mapping_type,
      source_value = excluded.source_value,
      target_value = excluded.target_value,
      variation_mapping = excluded.variation_mapping,
      is_enabled = excluded.is_enabled,
      display_order = excluded.display_order,
      updated_at = datetime('now')
  `);

  for (const mapping of mappings) {
    try {
      const result = upsertStmt.run(
        mapping.category,
        mapping.field_name,
        mapping.mapping_type,
        mapping.source_value,
        mapping.target_value,
        mapping.variation_mapping,
        mapping.is_enabled,
        mapping.display_order,
      );
      
      if (result.changes > 0) {
        // Check if this was an insert or update by checking if lastInsertRowid is set
        if (result.lastInsertRowid) {
          imported++;
        } else {
          updated++;
        }
      }
    } catch (err) {
      errors.push(`Error importing ${mapping.category}.${mapping.field_name}: ${err}`);
    }
  }

  info(`[AttributeMapping] Import complete: ${imported} imported, ${updated} updated`);
  return { imported, updated, errors };
};

/**
 * Helper functions for eBay listing creation
 */

/**
 * Get condition for eBay listing based on mapping.
 */
export const getEbayCondition = async (shopifyProduct: any): Promise<string> => {
  const conditionMapping = await getMapping('listing', 'condition');
  const resolvedValue = await resolveMapping(conditionMapping, shopifyProduct);
  
  if (resolvedValue) {
    // Map condition names to eBay condition IDs
    switch (resolvedValue.toLowerCase()) {
      case 'new':
        return '1000'; // New
      case 'like new':
        return '1500'; // New other
      case 'used':
      case 'good':
        return '3000'; // Used
      case 'for parts':
        return '7000'; // For parts or not working
      default:
        return '3000'; // Default to Used
    }
  }
  
  return '3000'; // Default to Used if no mapping
};

/**
 * Get UPC/EAN for eBay listing based on mapping.
 */
export const getEbayUPC = async (shopifyProduct: any): Promise<string | null> => {
  const upcMapping = await getMapping('listing', 'upc');
  return await resolveMapping(upcMapping, shopifyProduct);
};

/**
 * Get title for eBay listing based on mapping.
 */
export const getEbayTitle = async (shopifyProduct: any): Promise<string> => {
  const titleMapping = await getMapping('listing', 'title');
  const resolvedValue = await resolveMapping(titleMapping, shopifyProduct);
  
  // Fall back to Shopify title if mapping doesn't provide value
  return resolvedValue || shopifyProduct.title || 'Untitled Product';
};

/**
 * Get description for eBay listing based on mapping.
 */
export const getEbayDescription = async (shopifyProduct: any): Promise<string> => {
  const descMapping = await getMapping('listing', 'description');
  const resolvedValue = await resolveMapping(descMapping, shopifyProduct);
  
  // Fall back to Shopify description if mapping doesn't provide value
  return resolvedValue || shopifyProduct.body_html || shopifyProduct.title || 'No description available';
};

/**
 * Get handling time for eBay listing based on mapping.
 */
export const getEbayHandlingTime = async (shopifyProduct: any): Promise<number> => {
  const handlingMapping = await getMapping('shipping', 'handling_time');
  const resolvedValue = await resolveMapping(handlingMapping, shopifyProduct);
  
  if (resolvedValue && !isNaN(Number(resolvedValue))) {
    return Number(resolvedValue);
  }
  
  return 1; // Default to 1 business day
};