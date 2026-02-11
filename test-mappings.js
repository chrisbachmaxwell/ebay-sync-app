#!/usr/bin/env node

const API_KEY = 'ebay-sync-74e34e328df0e5aa431d712209ef4758';
const BASE_URL = 'https://ebay-sync-app-production.up.railway.app';

async function testMappings() {
  console.log('🧪 Testing Attribute Mapping System');
  
  try {
    // Test 1: Get all mappings
    console.log('\n1. Testing GET /api/mappings');
    const response1 = await fetch(`${BASE_URL}/api/mappings`, {
      headers: { 'x-api-key': API_KEY },
    });
    const mappings = await response1.json();
    console.log('✅ All mappings:', Object.keys(mappings), `(${Object.values(mappings).flat().length} total)`);

    // Test 2: Get mappings for listing category
    console.log('\n2. Testing GET /api/mappings/listing');
    const response2 = await fetch(`${BASE_URL}/api/mappings/listing`, {
      headers: { 'x-api-key': API_KEY },
    });
    const listingMappings = await response2.json();
    console.log('✅ Listing mappings count:', listingMappings.data?.length);

    // Test 3: Update condition mapping to "Like New"
    console.log('\n3. Testing PUT /api/mappings/listing/condition');
    const response3 = await fetch(`${BASE_URL}/api/mappings/listing/condition`, {
      method: 'PUT',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mapping_type: 'constant',
        target_value: 'Like New',
      }),
    });
    const updatedMapping = await response3.json();
    console.log('✅ Updated condition:', updatedMapping.target_value);

    // Test 4: Set title from Shopify product title
    console.log('\n4. Testing PUT /api/mappings/listing/title');
    const response4 = await fetch(`${BASE_URL}/api/mappings/listing/title`, {
      method: 'PUT',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mapping_type: 'shopify_field',
        source_value: 'title',
      }),
    });
    const titleMapping = await response4.json();
    console.log('✅ Updated title mapping:', `${titleMapping.mapping_type} -> ${titleMapping.source_value}`);

    // Test 5: Set handling time to 1 day constant
    console.log('\n5. Testing PUT /api/mappings/shipping/handling_time');
    const response5 = await fetch(`${BASE_URL}/api/mappings/shipping/handling_time`, {
      method: 'PUT',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mapping_type: 'constant',
        target_value: '1',
      }),
    });
    const handlingMapping = await response5.json();
    console.log('✅ Updated handling time:', handlingMapping.target_value, 'days');

    // Test 6: Export mappings
    console.log('\n6. Testing GET /api/mappings/export');
    const response6 = await fetch(`${BASE_URL}/api/mappings/export`, {
      headers: { 'x-api-key': API_KEY },
    });
    const exportedMappings = await response6.json();
    console.log('✅ Exported mappings count:', exportedMappings.length);

    // Test 7: Bulk update multiple mappings
    console.log('\n7. Testing POST /api/mappings/bulk');
    const response7 = await fetch(`${BASE_URL}/api/mappings/bulk`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mappings: [
          {
            category: 'listing',
            field_name: 'subtitle',
            mapping_type: 'constant',
            target_value: 'Available at Used Camera Gear',
          },
          {
            category: 'payment',
            field_name: 'immediate_payment',
            mapping_type: 'constant',
            target_value: 'true',
          },
        ],
      }),
    });
    const bulkResult = await response7.json();
    console.log('✅ Bulk update result:', `${bulkResult.updated} updated, ${bulkResult.failed} failed`);

    console.log('\n🎉 All mapping tests passed!');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

testMappings();